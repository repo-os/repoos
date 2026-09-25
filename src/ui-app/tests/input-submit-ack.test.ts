/**
 * New input submit → acknowledgment panel (0325): submitting hands creation to
 * the repo store and immediately swaps the form for a "ready in a few seconds"
 * panel with options to create another input or leave — mirroring the freeform
 * new-task flow (0311) — instead of blocking on the POST.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import NewInputPanel from "../src/components/NewInputPanel.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";

const json = async (data: unknown) => ({ ok: true, status: 201, json: async () => data });

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 4; i++) await nextTick();
}

interface FetchCall {
  url: string;
  opts?: RequestInit;
}

/** Stub fetch; `deferPost` holds the POST /api/inputs response until released. */
function stubFetch(deferPost = false): {
  calls: FetchCall[];
  releasePost: (body?: unknown) => void;
} {
  const calls: FetchCall[] = [];
  let postResolve: ((v: unknown) => void) | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL, opts?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, opts });
      if (u === "/api/inputs" && opts?.method === "POST") {
        if (!deferPost) return Promise.resolve(json({ id: "0007" }));
        return new Promise((resolve) => {
          postResolve = () => resolve(json({ id: "0007" }));
        });
      }
      if (u.startsWith("/api/inputs/") && u.includes("/attachments"))
        return Promise.resolve(json({ ok: true, attachment: {} }));
      return Promise.reject(new Error("unexpected fetch: " + u));
    }),
  );
  return {
    calls,
    releasePost: (body?: unknown) => postResolve?.(body ?? { id: "0007" }),
  };
}

async function mountPanel(): Promise<{
  wrapper: VueWrapper;
  ui: ReturnType<typeof useUiStore>;
  repo: ReturnType<typeof useRepoStore>;
}> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const ui = useUiStore();
  const repo = useRepoStore();
  ui.openNewInput();
  const wrapper = mount(NewInputPanel, {
    global: { plugins: [pinia], stubs: { teleport: true, Transition: true } },
  });
  await flush();
  return { wrapper, ui, repo };
}

async function submitText(wrapper: VueWrapper, text = "Saw a bug on the board"): Promise<void> {
  const textarea = wrapper.find("#new-input-text");
  await textarea.setValue(text);
  const btn = wrapper.findAll("button").find((b) => b.text().includes("Submit input"));
  expect(btn).toBeTruthy();
  await btn!.trigger("click");
  await flush();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("new input submit acknowledgment (0325)", () => {
  it("shows the acknowledgment panel immediately, while creation is still in flight", async () => {
    stubFetch(true);
    const { wrapper } = await mountPanel();

    const textarea = wrapper.find("#new-input-text");
    await textarea.setValue("Saw a bug on the board");
    const btn = wrapper.findAll("button").find((b) => b.text().includes("Submit input"));
    await btn!.trigger("click");
    // A few microtask ticks, but no settling of the deferred POST — the
    // panel must already be acknowledging, not blocked on a loading button.
    await nextTick();
    await nextTick();

    const panel = wrapper.find(".ff-done");
    expect(panel.exists()).toBe(true);
    expect(panel.text()).toContain("Creating your input");
    expect(panel.text()).toContain("background");
    expect(panel.text()).toContain("few seconds");
    expect(panel.text()).toContain("nothing is lost");
    expect(panel.text()).toContain("Create another input");
    expect(panel.text()).toContain("Done");
    expect(wrapper.find("#new-input-text").exists()).toBe(false);
  });

  it("uploads attachments against the created input and announces the refresh", async () => {
    const { calls, releasePost } = stubFetch(true);
    const { wrapper, ui } = await mountPanel();
    ui.inputScreenshots.push({
      name: "shot.png",
      mime: "image/png",
      dataUrl: "data:image/png;base64,QUJD",
      size: 3,
    });
    let refreshed = 0;
    window.addEventListener("repoos:inputs-updated", onRefresh);
    function onRefresh(): void {
      refreshed++;
    }
    try {
      await submitText(wrapper);
      expect(wrapper.find(".ff-done").exists()).toBe(true);

      releasePost();
      await flush();

      const att = calls.find(
        (c) => c.url.startsWith("/api/inputs/0007/") && c.url.endsWith("/attachments"),
      );
      expect(att).toBeTruthy();
      expect(refreshed).toBe(1);
      // The form was cleared at submit; nothing reappears after success.
      expect(ui.inputText).toBe("");
      expect(ui.inputScreenshots.length).toBe(0);
    } finally {
      window.removeEventListener("repoos:inputs-updated", onRefresh);
    }
  });

  it("Create another input returns to a clean form while creation continues", async () => {
    stubFetch(true);
    const { wrapper } = await mountPanel();
    await submitText(wrapper);

    const another = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Create another input"));
    await another!.trigger("click");
    await flush();

    expect(wrapper.find(".ff-done").exists()).toBe(false);
    const textarea = wrapper.find("#new-input-text");
    expect(textarea.exists()).toBe(true);
    expect((textarea.element as HTMLTextAreaElement).value).toBe("");
  });

  it("Done closes the new-input pane without interrupting in-flight creation", async () => {
    const { releasePost } = stubFetch(true);
    const { wrapper, ui } = await mountPanel();
    await submitText(wrapper);

    const done = wrapper.findAll("button").find((b) => b.text().trim() === "Done");
    await done!.trigger("click");
    await flush();

    expect(ui.isNewInput).toBe(false);
    expect(wrapper.find(".ff-done").exists()).toBe(false);

    // The background job still runs to completion after the panel closed.
    releasePost();
    await flush();
  });

  it("removes a pending attachment before submit", async () => {
    const { wrapper, ui } = await mountPanel();
    ui.inputScreenshots.push({
      name: "draft.png",
      mime: "image/png",
      dataUrl: "data:image/png;base64,QUJD",
      size: 3,
    });
    await flush();
    expect(wrapper.find(".ff-pending-file-remove").exists()).toBe(true);
    await wrapper.find(".ff-pending-file-remove").trigger("click");
    expect(ui.inputScreenshots.length).toBe(0);
  });

  it("queues files dropped on the panel", async () => {
    const { wrapper, ui } = await mountPanel();
    const addSpy = vi.spyOn(ui, "addInputScreenshots");
    const file = new File(["x"], "drop.txt", { type: "text/plain" });
    await wrapper.find(".drawer-wrap").trigger("drop", {
      dataTransfer: { files: [file] },
    });
    expect(addSpy).toHaveBeenCalledWith([file]);
  });

  it("restores the capture and toasts when creation fails in the background", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { wrapper, ui, repo } = await mountPanel();
    await submitText(wrapper, "Something went wrong");
    expect(wrapper.find(".ff-done").exists()).toBe(true);

    await flush();
    // The compose box is empty (nothing new typed), so the failed text is
    // put back for retry and the failure surfaces through the toast channel.
    expect(ui.inputText).toBe("Something went wrong");
    expect(repo.toasts.some((t) => t.type === "error" && t.message.length > 0)).toBe(true);
  });
});

describe("new input draft persistence (0498)", () => {
  const sampleShot = {
    name: "keep.png",
    mime: "image/png",
    dataUrl: "data:image/png;base64,QUJD",
    size: 3,
  };

  it("keeps text and attachments across close and reopen", async () => {
    const { wrapper, ui } = await mountPanel();
    await wrapper.find("#new-input-text").setValue("Draft stays put");
    ui.inputScreenshots.push({ ...sampleShot });
    await flush();

    ui.close();
    await flush();
    expect(ui.isNewInput).toBe(false);

    ui.openNewInput();
    await flush();

    expect(ui.inputText).toBe("Draft stays put");
    expect(ui.inputScreenshots.length).toBe(1);
    expect((wrapper.find("#new-input-text").element as HTMLTextAreaElement).value).toBe(
      "Draft stays put",
    );
  });

  it("Clear discards text and attachments", async () => {
    const { wrapper, ui } = await mountPanel();
    await wrapper.find("#new-input-text").setValue("To be cleared");
    ui.inputScreenshots.push({ ...sampleShot });
    await flush();

    const clearBtn = wrapper
      .findAll("button")
      .find((b) => b.attributes("aria-label") === "Clear draft");
    expect(clearBtn).toBeTruthy();
    await clearBtn!.trigger("click");
    await flush();

    expect(ui.inputText).toBe("");
    expect(ui.inputScreenshots.length).toBe(0);
    const submit = wrapper.findAll("button").find((b) => b.text().includes("Submit input"));
    expect(submit!.attributes("disabled")).toBeDefined();
  });

  it("openNewTask does not wipe an in-progress New input draft", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const ui = useUiStore();
    ui.inputText = "Input draft";
    ui.inputScreenshots.push({ ...sampleShot });
    ui.openNewTask();
    expect(ui.inputText).toBe("Input draft");
    expect(ui.inputScreenshots.length).toBe(1);
    expect(ui.pendingScreenshots.length).toBe(0);
  });
});
