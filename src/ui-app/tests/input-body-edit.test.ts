/**
 * Input body editing (#0497): PATCH /api/inputs/:id accepts optional `text`,
 * `updateInput` rewrites the markdown body (re-deriving title from the first
 * line), and the Inputs drawer opens an Edit Input modal to persist changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable, Writable } from "node:stream";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import { useRepoStore } from "../src/stores/repo";
import { createInput, listInputs, updateInput } from "../../core/input";
import { createRepoOS } from "../../core/repoos";
import type { Input } from "../../core/input.js";
import { patchInput } from "../../server/routes/inputs";
import { createLogger } from "../../core/logger";
import InputsView from "../src/views/InputsView.vue";
import DialogContent from "../src/components/ui/dialog/content.vue";
import type { RouteContext } from "../../server/routes/types";

const api = vi.spyOn(apiMod, "api");

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

function makeInput(overrides: Partial<Input> = {}): Input {
  return {
    id: "idea-1",
    number: "0001",
    title: "Add a dark mode toggle",
    status: "new",
    body: "It would be nice to have a dark mode toggle in settings.",
    type: "idea",
    area: "web",
    createdBy: "human",
    createdAt: "2026-09-14T00:00:00Z",
    updatedAt: "2026-09-14T00:00:00Z",
    path: "inputs/idea-1.md",
    attachments: [],
    resolution: "",
    resolvedTask: "",
    ...overrides,
  };
}

function makeCtx(root: string, repoos: ReturnType<typeof createRepoOS>): RouteContext {
  return {
    config: repoos.config,
    repoos,
    index: {} as RouteContext["index"],
    indexReady: Promise.resolve(),
    runner: {} as RouteContext["runner"],
    previews: {} as RouteContext["previews"],
    reviews: {} as RouteContext["reviews"],
    cto: {} as RouteContext["cto"],
    freeformRuns: {} as RouteContext["freeformRuns"],
    logger: createLogger(root),
    emitEvent: () => {},
    closeOutLock: {} as RouteContext["closeOutLock"],
    rootLock: {} as RouteContext["rootLock"],
    jobCoordinator: {} as RouteContext["jobCoordinator"],
    reportedStages: {},
    triggerJobProcessing: () => {},
    pendingReview: new Set(),
    uiDir: null,
    reload: null,
    syncTaskBranch: () => Promise.resolve({ ok: true, conflicts: [] }),
    onServerStatusChange: () => {},
  } as RouteContext;
}

function makeReqRes(body: unknown): {
  req: IncomingMessage;
  res: ServerResponse;
  capture: { status: number; body: unknown };
} {
  const capture = { status: 0, body: undefined as unknown };
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  const req = new Readable({
    read() {
      this.push(payload);
      this.push(null);
    },
  }) as unknown as IncomingMessage;
  req.headers = { "content-type": "application/json" };
  req.method = "PATCH";

  const chunks: Buffer[] = [];
  const res = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  }) as unknown as ServerResponse;
  const resAsServer = res as unknown as {
    writeHead: (status: number) => ServerResponse;
    end: (chunk?: string | Buffer) => ServerResponse;
  };
  resAsServer.writeHead = (status: number) => {
    capture.status = status;
    return res;
  };
  resAsServer.end = (chunk?: string | Buffer) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    try {
      capture.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      capture.body = Buffer.concat(chunks).toString("utf8");
    }
    return res;
  };
  return { req, res, capture };
}

describe("updateInput body patch (#0497)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-input-edit-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("rewrites the markdown body and re-derives title from the first line", () => {
    const config = createRepoOS(root).config;
    const created = createInput(config, "Old title line\n\nDetails.", "idea", "human");
    const updated = updateInput(config, created.id, { text: "# New headline\n\nRevised body." });

    expect(updated.body).toBe("# New headline\n\nRevised body.");
    expect(updated.title).toBe("New headline");

    const raw = readFileSync(join(root, updated.path), "utf8");
    expect(raw).toMatch(/^title: New headline$/m);
    expect(raw).toContain("# New headline");
    expect(listInputs(config)[0].body).toBe(updated.body);
  });

  it("still updates status when provided", () => {
    const config = createRepoOS(root).config;
    const created = createInput(config, "An idea", "idea", "human");
    const updated = updateInput(config, created.id, { status: "reviewing" });
    expect(updated.status).toBe("reviewing");
  });
});

describe("patchInput route (#0497)", () => {
  let root: string;
  let repoos: ReturnType<typeof createRepoOS>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-input-edit-route-"));
    repoos = createRepoOS(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns 400 for whitespace-only text", async () => {
    const input = createInput(repoos.config, "Hello", "idea", "human");
    const { req, res, capture } = makeReqRes({ text: "   " });
    await patchInput(makeCtx(root, repoos), req, res, { param1: input.id });
    expect(capture.status).toBe(400);
    expect(capture.body).toEqual({ error: "text is required" });
  });

  it("returns 404 for a missing input", async () => {
    const { req, res, capture } = makeReqRes({ text: "Still here" });
    await patchInput(makeCtx(root, repoos), req, res, { param1: "nope" });
    expect(capture.status).toBe(404);
  });

  it("persists edited text and returns the updated input", async () => {
    const input = createInput(repoos.config, "Original", "idea", "human");
    const { req, res, capture } = makeReqRes({ text: "Corrected text" });
    await patchInput(makeCtx(root, repoos), req, res, { param1: input.id });
    expect(capture.status).toBe(200);
    expect((capture.body as Input).body).toBe("Corrected text");
  });
});

describe("InputsView Edit Input modal (#0497)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  });

  afterEach(() => {
    api.mockReset();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  async function mountWith(inputs: Input[]): Promise<VueWrapper> {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/inputs" && !init?.method) return inputs;
      if (path.startsWith("/api/inputs/") && init?.method === "PATCH") {
        const patch = init.body
          ? (JSON.parse(String(init.body)) as { status?: string; text?: string })
          : {};
        const id = path.split("/")[3];
        const found = inputs.find((i) => i.id === id);
        if (!found) throw new Error("missing");
        if (patch.status) found.status = patch.status as Input["status"];
        if (patch.text !== undefined) {
          found.body = patch.text;
          found.title = patch.text.split(/\n/)[0].replace(/^#\s*/, "").slice(0, 100) || found.title;
        }
        return { ...found };
      }
      throw new Error("unexpected api: " + path);
    });
    const wrapper = mount(InputsView, { attachTo: document.body });
    await flushPromises();
    return wrapper;
  }

  it("opens the modal, saves new text, and updates the drawer and list", async () => {
    const input = makeInput();
    const wrapper = await mountWith([input]);
    await wrapper.find(".input-row").trigger("click");
    await flushPromises();

    const editBtn = wrapper.find(".detail-body-head button");
    expect(editBtn.text()).toContain("Edit");
    await editBtn.trigger("click");
    await flushPromises();

    const modal = document.body.querySelector(".sm-modal");
    expect(modal).toBeTruthy();

    const textarea = document.body.querySelector(".sm-modal-textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    textarea.value = "Updated input body";
    textarea.dispatchEvent(new Event("input"));
    await flushPromises();

    const saveBtn = Array.from(document.body.querySelectorAll(".sm-modal-actions button")).find(
      (b) => b.textContent?.trim() === "Save",
    ) as HTMLButtonElement | undefined;
    expect(saveBtn).toBeTruthy();
    saveBtn!.click();
    await flushPromises();

    const drawer = wrapper.findComponent(DialogContent);
    expect(drawer.text()).toContain("Updated input body");
    expect(wrapper.find(".input-row p").text()).toContain("Updated input body");

    const repo = useRepoStore();
    expect(repo.inputs[0].body).toBe("Updated input body");
  });

  it("leaves the input unchanged when the modal is cancelled", async () => {
    const input = makeInput();
    const wrapper = await mountWith([input]);
    await wrapper.find(".input-row").trigger("click");
    await flushPromises();
    await wrapper.find(".detail-body-head button").trigger("click");
    await flushPromises();

    const textarea = document.body.querySelector(".sm-modal-textarea") as HTMLTextAreaElement;
    textarea.value = "Should not save";
    textarea.dispatchEvent(new Event("input"));
    await flushPromises();

    const cancelBtn = Array.from(document.body.querySelectorAll(".sm-modal-actions button")).find(
      (b) => b.textContent?.trim() === "Cancel",
    ) as HTMLButtonElement | undefined;
    cancelBtn!.click();
    await flushPromises();

    expect(wrapper.find(".detail-body").text()).toBe(input.body);
    expect(api).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/inputs\//),
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
