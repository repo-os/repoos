/**
 * QA #1248 — New input uploads with large, wrong-type, duplicate and failing
 * files. Every rejection is plain English, the 12-file cap holds across a
 * multi-file drop, duplicate names are renamed instead of overwriting each
 * other on the server, and a failed read leaves nothing half-added.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { Readable } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import NewInputPanel from "../src/components/NewInputPanel.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import {
  SCREENSHOT_MAX_BYTES,
  screenshotMime,
  screenshotRejection,
  uniqueAttachmentName,
} from "../src/lib/upload-guard";
import { SCREENSHOT_ACCEPT } from "../src/lib/screenshot-viewer";
import { MAX_SCREENSHOT_BYTES } from "../../server/attachments.js";
import { createRepoOS } from "../../core/repoos";
import { createInput } from "../../core/input";
import { uploadInputAttachment } from "../../server/routes/inputs";
import type { RouteContext } from "../../server/routes/types";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function png(name: string, size = 16): File {
  return new File([new Uint8Array(size)], name, { type: "image/png" });
}

/** Wait until every pending FileReader has settled into the store. */
async function settle(): Promise<void> {
  await vi.waitFor(() => {
    const ui = useUiStore();
    expect(ui.inputScreenshots.every((s) => s.dataUrl !== "")).toBe(true);
  });
  await nextTick();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("upload-guard helpers", () => {
  it("accepts every supported image type, including by extension when type is blank", () => {
    for (const type of SCREENSHOT_ACCEPT.split(",")) {
      expect(screenshotRejection(new File(["x"], "a", { type }))).toBeNull();
    }
    expect(screenshotMime(new File(["x"], "shot.AVIF", { type: "" }))).toBe("image/avif");
  });

  it("rejects a wrong type with a plain-English fix", () => {
    const msg = screenshotRejection(new File(["x"], "spec.pdf", { type: "application/pdf" }));
    expect(msg).toContain("“spec.pdf” isn’t an image we can attach");
    expect(msg).toContain("PNG, JPEG, GIF, WebP, AVIF or BMP");
  });

  it("rejects an empty file before checking its type", () => {
    const msg = screenshotRejection(new File([], "blank.png", { type: "image/png" }));
    expect(msg).toBe("“blank.png” is empty. Pick a file that has content.");
  });

  it("rejects a file over the limit and says what to do", () => {
    const msg = screenshotRejection({
      name: "huge.png",
      type: "image/png",
      size: SCREENSHOT_MAX_BYTES + 1,
    });
    expect(msg).toBe(
      "“huge.png” is 10.1 MB, and the limit is 10 MB. Crop or compress it, then add it again.",
    );
  });

  it("keeps the client limit equal to the server's screenshot cap", () => {
    expect(SCREENSHOT_MAX_BYTES).toBe(MAX_SCREENSHOT_BYTES);
  });

  it("renames duplicates to the first free suffix", () => {
    const taken = new Set(["shot.png", "shot-2.png"]);
    expect(uniqueAttachmentName("shot.png", taken)).toBe("shot-3.png");
    expect(uniqueAttachmentName("notes", new Set(["notes"]))).toBe("notes-2");
    expect(uniqueAttachmentName("fresh.png", taken)).toBe("fresh.png");
  });
});

describe("ui store addInputScreenshots", () => {
  it("keeps bad files out of the list and says why", async () => {
    setActivePinia(createPinia());
    const ui = useUiStore();
    ui.addInputScreenshots([
      new File(["x"], "spec.pdf", { type: "application/pdf" }),
      new File([], "empty.png", { type: "image/png" }),
      png("ok.png"),
    ]);
    await settle();
    expect(ui.inputScreenshots.map((s) => s.name)).toEqual(["ok.png"]);
    expect(ui.inputUploadNotices).toHaveLength(2);
    expect(ui.inputUploadNotices[0]).toContain("spec.pdf");
    expect(ui.inputUploadNotices[1]).toContain("empty.png");
  });

  it("holds the 12-file cap across one multi-file drop", async () => {
    setActivePinia(createPinia());
    const ui = useUiStore();
    ui.addInputScreenshots(Array.from({ length: 15 }, (_, i) => png(`s${i}.png`)));
    await settle();
    expect(ui.inputScreenshots).toHaveLength(12);
    expect(ui.inputUploadNotices).toHaveLength(3);
    expect(ui.inputUploadNotices[0]).toContain("s12.png");
    expect(ui.inputUploadNotices[0]).toContain("12 screenshots");
  });

  it("renames a duplicate so the server never overwrites the earlier file", async () => {
    setActivePinia(createPinia());
    const ui = useUiStore();
    ui.addInputScreenshots([png("shot.png"), png("shot.png")]);
    ui.addInputScreenshots([png("shot.png")]);
    await settle();
    expect(ui.inputScreenshots.map((s) => s.name)).toEqual([
      "shot.png",
      "shot-2.png",
      "shot-3.png",
    ]);
    expect(ui.inputUploadNotices.join("\n")).toContain("saved as “shot-2.png”");
  });

  it("drops a file whose read fails and reports it, without leaving an empty thumbnail", async () => {
    class FailingReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL(): void {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("FileReader", FailingReader);
    setActivePinia(createPinia());
    const ui = useUiStore();
    ui.addInputScreenshots([png("flaky.png")]);
    await vi.waitFor(() => expect(ui.inputUploadNotices).toHaveLength(1));
    expect(ui.inputScreenshots).toHaveLength(0);
    expect(ui.inputUploadNotices[0]).toContain("Couldn’t read “flaky.png”");
  });
});

describe("NewInputPanel upload feedback", () => {
  async function mountPanel(): Promise<{ wrapper: VueWrapper; ui: ReturnType<typeof useUiStore> }> {
    const pinia = createPinia();
    setActivePinia(pinia);
    const ui = useUiStore();
    useRepoStore();
    ui.openNewInput();
    const wrapper = mount(NewInputPanel, {
      global: { plugins: [pinia], stubs: { teleport: true, Transition: true } },
    });
    await nextTick();
    return { wrapper, ui };
  }

  it("shows rejection notices in an alert that can be dismissed", async () => {
    const { wrapper, ui } = await mountPanel();
    ui.addInputScreenshots([new File(["x"], "spec.pdf", { type: "application/pdf" })]);
    await nextTick();
    const alert = wrapper.find(".ff-upload-notices");
    expect(alert.attributes("role")).toBe("alert");
    expect(alert.text()).toContain("“spec.pdf” isn’t an image");
    await alert.find("button").trigger("click");
    expect(wrapper.find(".ff-upload-notices").exists()).toBe(false);
  });

  it("holds Submit while a screenshot is still being read", async () => {
    const { wrapper, ui } = await mountPanel();
    ui.inputText = "Saw a bug";
    ui.addInputScreenshots([png("slow.png")]);
    await nextTick();
    const submit = () => wrapper.findAll("button").find((b) => b.text().includes("Submit input"))!;
    expect(submit().attributes("disabled")).toBeDefined();
    await settle();
    await nextTick();
    expect(submit().attributes("disabled")).toBeUndefined();
  });
});

describe("POST /api/inputs/:id/attachments validation", () => {
  function fakeRes() {
    const out: { status?: number; body?: unknown } = {};
    const res = {
      writeHead(status: number) {
        out.status = status;
        return res;
      },
      end(payload: string) {
        out.body = JSON.parse(payload);
      },
    };
    return { res, out };
  }

  async function call(ctx: unknown, id: string, body: unknown) {
    const { res, out } = fakeRes();
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    await uploadInputAttachment(
      ctx as RouteContext,
      req as never,
      res as never,
      { param1: id } as never,
    );
    return out;
  }

  it("rejects a non-image name with 400 and nothing is stored", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-input-upload-"));
    try {
      const repoos = createRepoOS(root);
      const input = createInput(repoos.config, "Idea", "idea", "human");
      const out = await call({ config: repoos.config }, input.id, {
        name: "spec.pdf",
        data: PNG_1PX,
      });
      expect(out.status).toBe(400);
      expect((out.body as { error: string }).error).toContain("isn't an image we can attach");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects an oversized image with 413 before writing it", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-input-upload-"));
    try {
      const repoos = createRepoOS(root);
      const input = createInput(repoos.config, "Idea", "idea", "human");
      const huge = Buffer.alloc(MAX_SCREENSHOT_BYTES + 1).toString("base64");
      const out = await call({ config: repoos.config }, input.id, { name: "huge.png", data: huge });
      expect(out.status).toBe(413);
      expect((out.body as { error: string }).error).toContain("too large");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns 404 only when the input is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-input-upload-"));
    try {
      const repoos = createRepoOS(root);
      const out = await call({ config: repoos.config }, "9999", {
        name: "ok.png",
        data: PNG_1PX,
      });
      expect(out.status).toBe(404);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("stores a valid screenshot with 201", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-input-upload-"));
    try {
      const repoos = createRepoOS(root);
      const input = createInput(repoos.config, "Idea", "idea", "human");
      const out = await call({ config: repoos.config }, input.id, {
        name: "ok.png",
        data: PNG_1PX,
      });
      expect(out.status).toBe(201);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
