/**
 * Delete input / Delete story panel buttons (#0634): destructive controls in
 * the same `.delete-zone` position as the task panel's Delete task, confirmed
 * through the shared DeleteConfirmDialog, wired to the DELETE routes through
 * the repo store. Radix dialogs teleport to `body`, so dialog assertions read
 * `document.body`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import { useRepoStore } from "../src/stores/repo";
import { useConfigStore } from "../src/stores/config";
import InputsView from "../src/views/InputsView.vue";
import StoriesView from "../src/views/StoriesView.vue";
import type { Input } from "../../core/input.js";
import { makeTask } from "./component-test-helpers";
import type { Task } from "../src/types";

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

function definition(name: string, body = "The slice.", number = "0001") {
  return {
    key: name.toLowerCase(),
    name,
    number,
    path: `stories/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`,
    body,
    createdAt: "2026-09-01T00:00:00Z",
    createdBy: "hello@repoos.org",
  };
}

/** Minimal api stub: board/inputs GETs for the views' mounts, DELETE capture. */
function stubApi(opts: { inputs?: Input[]; deleteError?: boolean } = {}) {
  const deletes: string[] = [];
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/board") return { tasks: [] };
    if (path === "/api/inputs") return opts.inputs ?? [];
    if (init?.method === "DELETE") {
      deletes.push(path);
      if (opts.deleteError) throw new Error("delete failed");
      return { ok: true };
    }
    return [];
  });
  return { deletes };
}

async function confirmDialog(label: string): Promise<void> {
  const modal = document.body.querySelector(".delete-confirm-modal");
  expect(modal, "confirm dialog did not open").toBeTruthy();
  // #0575: the modal and its scrim are the shared ui/dialog primitives, which
  // stamp their own `data-overlay-layer` id — without it Radix's
  // `pointer-events: none` on <body> would make the layer click-transparent.
  expect(modal!.getAttribute("data-overlay-layer")).toMatch(/^overlay-/);
  expect(document.body.querySelector(".overlay")?.getAttribute("data-overlay-layer")).toMatch(
    /^overlay-/,
  );
  expect(modal!.textContent).toContain(label);
  const btn = Array.from(modal!.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(label),
  );
  expect(btn, "no confirm button").toBeTruthy();
  btn!.click();
  await flushPromises();
}

// ── Inputs drawer ────────────────────────────────────────────────────────────

describe("inputs side-panel delete (#0634)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  });
  afterEach(() => {
    api.mockReset();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  async function openInputDrawer(input: Input, deleteError = false): Promise<VueWrapper> {
    const { deletes } = stubApi({ inputs: [input], deleteError });
    useRepoStore().inputs = [input];
    const w = mount(InputsView, { attachTo: document.body });
    (w as unknown as { deletes?: string[] }).deletes = deletes;
    await flushPromises();
    await w.find(".input-row").trigger("click");
    await flushPromises();
    return w;
  }

  function deletesOf(wrapper: VueWrapper): string[] {
    return (wrapper as { deletes?: string[] }).deletes ?? [];
  }

  it("shows Delete input at the bottom of the drawer and deletes after confirm", async () => {
    const wrapper = await openInputDrawer(makeInput());
    const deletes = deletesOf(wrapper);
    const zone = document.body.querySelector(".drawer .delete-zone");
    expect(zone).toBeTruthy();
    const btn = Array.from(zone!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Delete input"),
    );
    expect(btn).toBeTruthy();

    btn!.click();
    await flushPromises();
    expect(deletes).toHaveLength(0); // only confirmed deletes hit the API

    await confirmDialog("Delete input");
    expect(deletes).toEqual(["/api/inputs/idea-1"]);
    // The drawer closed and the list dropped the row without a reload.
    expect(document.body.querySelector(".drawer")).toBeNull();
  });

  it("keeps the drawer open and shows the error when the delete 404s", async () => {
    const wrapper = await openInputDrawer(makeInput(), true);
    const zone = document.body.querySelector(".drawer .delete-zone")!;
    Array.from(zone.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("Delete input"))!
      .click();
    await flushPromises();

    await confirmDialog("Delete input");
    expect(deletesOf(wrapper)).toEqual(["/api/inputs/idea-1"]);
    expect(document.body.querySelector(".drawer")).toBeTruthy();
  });

  it("cancelling the confirmation leaves everything untouched", async () => {
    const wrapper = await openInputDrawer(makeInput());
    const zone = document.body.querySelector(".drawer .delete-zone")!;
    Array.from(zone.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("Delete input"))!
      .click();
    await flushPromises();
    const modal = document.body.querySelector(".delete-confirm-modal")!;
    Array.from(modal.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("Cancel"))!
      .click();
    await flushPromises();
    expect(deletesOf(wrapper)).toHaveLength(0);
    expect(document.body.querySelector(".drawer")).toBeTruthy();
  });
});

// ── Story panel ──────────────────────────────────────────────────────────────

describe("story side-panel delete (#0634)", () => {
  const NewStoryPanelStub = { template: "<div />" };
  let mounted: VueWrapper[] = [];

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    useConfigStore().data = { stories: { enabled: true } };
  });
  afterEach(() => {
    for (const w of mounted.splice(0)) w.unmount();
    api.mockReset();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  async function openDetailsTab(
    tasks: Task[],
    definitions: ReturnType<typeof definition>[],
    opts: { capture?: string[]; deleteError?: boolean } = {},
  ) {
    stubApi();
    const repo = useRepoStore();
    repo.tasks = tasks;
    repo.storyDefinitions = definitions;
    const wrapper = mount(StoriesView, {
      attachTo: document.body,
      global: { stubs: { NewStoryPanel: NewStoryPanelStub } },
    });
    mounted.push(wrapper);
    await flushPromises();
    // Swap in the capturing DELETE implementation only after the mount-time
    // reads are done, so stubApi's mount stubs are not overwritten early.
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/board") return { tasks: [] };
      if (path === "/api/inputs") return [];
      if (init?.method === "DELETE") {
        opts.capture?.push(path);
        if (opts.deleteError) throw new Error("delete failed");
        return { ok: true };
      }
      return [];
    });
    await wrapper.find(".story-head").trigger("click");
    await flushPromises();
    const detailsBtn = Array.from(
      document.body.querySelectorAll<HTMLElement>(".drawer-tabs .tab-btn"),
    ).find((b) => b.textContent?.includes("Details"));
    detailsBtn!.click();
    await flushPromises();
  }

  it("shows Delete story on the Details tab for a registered story and deletes after confirm", async () => {
    const captured: string[] = [];
    const def = definition("Alpha slice", "The whole scope.");
    await openDetailsTab([makeTask({ id: "0001", story: "Alpha slice", status: "ready" })], [def], {
      capture: captured,
    });

    const zone = document.body.querySelector(".story-panel-facts .delete-zone");
    expect(zone, "delete zone missing on Details tab").toBeTruthy();
    const btn = Array.from(zone!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Delete story"),
    );
    expect(btn).toBeTruthy();

    btn!.click();
    await flushPromises();
    expect(captured).toHaveLength(0);

    await confirmDialog("Delete story");
    expect(captured).toEqual(["/api/stories/alpha%20slice"]);
    // The panel closes; the SSE story.definitionsChanged refresh drops the row.
    expect(document.body.querySelector(".drawer")).toBeNull();
  });

  it("hides Delete story for a tag-only story with no definition", async () => {
    await openDetailsTab([makeTask({ id: "0001", story: "Tag only", status: "ready" })], []);
    expect(document.body.querySelector(".story-panel-facts .delete-zone")).toBeNull();
    expect(document.body.textContent).not.toContain("Delete story");
  });
});
