/**
 * Inputs page list/board view toggle (#0401): default is list, preference
 * persists in localStorage, and board view renders status columns with the
 * shared board column chrome (collapsible headers).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import type { Input } from "../../core/input.js";
import InputsView from "../src/views/InputsView.vue";
import { resetInputCollapseForTests } from "../src/lib/inputsBoardCollapse";

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

async function mountView(
  inputs: Input[] = [makeInput()],
  opts: { holdLoad?: { release: (inputs: Input[]) => void } } = {},
): Promise<VueWrapper> {
  let resolveHeld: ((inputs: Input[]) => void) | null = null;
  const held = opts.holdLoad
    ? new Promise<Input[]>((resolve) => {
        resolveHeld = resolve;
        opts.holdLoad!.release = (list) => resolve(list);
      })
    : null;

  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/inputs" && !init?.method) {
      if (held) return held;
      return inputs;
    }
    if (path.startsWith("/api/inputs/") && init?.method === "PATCH") {
      const body = init.body
        ? (JSON.parse(String(init.body)) as { status: string })
        : { status: "" };
      const id = path.split("/")[3];
      const found = inputs.find((i) => i.id === id);
      if (!found) throw new Error("missing input " + id);
      found.status = body.status as Input["status"];
      return found;
    }
    throw new Error("unexpected api: " + path);
  });
  const wrapper = mount(InputsView, { attachTo: document.body });
  await flushPromises();
  // Satisfy TS — release is assigned synchronously in the Promise executor.
  void resolveHeld;
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  localStorage.clear();
  resetInputCollapseForTests();
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("InputsView list/board toggle", () => {
  it("defaults to list view", async () => {
    const wrapper = await mountView();
    expect(wrapper.find(".input-list").exists()).toBe(true);
    expect(wrapper.find(".inputs-board").exists()).toBe(false);
    expect(wrapper.find(".view-toggle-btn.active").text()).toContain("List");
  });

  it("switches to board view and persists the preference", async () => {
    const wrapper = await mountView([
      makeInput(),
      makeInput({ id: "idea-2", number: "0002", status: "reviewing", title: "Review me" }),
    ]);

    await wrapper.findAll(".view-toggle-btn")[1].trigger("click");
    await flushPromises();

    expect(wrapper.find(".inputs-board").exists()).toBe(true);
    expect(wrapper.find(".input-list").exists()).toBe(false);
    expect(localStorage.getItem("inputs-view-mode")).toBe("board");
    expect(wrapper.findAll(".board-col").length).toBe(2);
  });

  it("restores board view from localStorage on mount", async () => {
    localStorage.setItem("inputs-view-mode", "board");
    const wrapper = await mountView();

    expect(wrapper.find(".inputs-board").exists()).toBe(true);
    expect(wrapper.find(".view-toggle-btn.active").text()).toContain("Board");
  });

  it("opens an input from a board card", async () => {
    localStorage.setItem("inputs-view-mode", "board");
    const wrapper = await mountView();

    await wrapper.find(".task-card").trigger("click");
    await flushPromises();

    expect(wrapper.find(".input-detail").exists()).toBe(true);
    expect(wrapper.text()).toContain("Add a dark mode toggle");
  });

  it("collapses a board column when its header is clicked", async () => {
    localStorage.setItem("inputs-view-mode", "board");
    // Seed saved collapse state so defaults don't auto-collapse empty columns.
    localStorage.setItem("repoos.inputs.board.collapsed", JSON.stringify([]));
    resetInputCollapseForTests();
    const wrapper = await mountView();

    const col = wrapper.find(".board-col");
    expect(col.classes()).not.toContain("collapsed");
    await col.find(".col-head").trigger("click");
    expect(col.classes()).toContain("collapsed");
    expect(JSON.parse(localStorage.getItem("repoos.inputs.board.collapsed")!)).toContain("new");
  });

  it("does not apply empty collapse defaults before the first load finishes", async () => {
    localStorage.setItem("inputs-view-mode", "board");
    const hold: { release: (inputs: Input[]) => void } = {
      release: () => {
        throw new Error("release not ready");
      },
    };
    const wrapper = await mountView([], { holdLoad: hold });

    // Board is up, still waiting on /api/inputs — must not persist a full collapse.
    expect(localStorage.getItem("repoos.inputs.board.collapsed")).toBeNull();

    hold.release([makeInput()]);
    await flushPromises();

    const newCol = wrapper.findAll(".board-col").find((c) => c.text().includes("New"));
    expect(newCol).toBeTruthy();
    expect(newCol!.classes()).not.toContain("collapsed");
    expect(JSON.parse(localStorage.getItem("repoos.inputs.board.collapsed") ?? "[]")).not.toContain(
      "new",
    );
  });

  it("moves an input to the next status from a board card and reveals the destination", async () => {
    localStorage.setItem("inputs-view-mode", "board");
    localStorage.setItem("repoos.inputs.board.collapsed", JSON.stringify([]));
    resetInputCollapseForTests();
    const wrapper = await mountView([makeInput()]);

    const reviewing = wrapper.findAll(".board-col").find((c) => c.text().includes("Reviewing"));
    expect(reviewing).toBeTruthy();
    await reviewing!.find(".col-head").trigger("click");
    expect(reviewing!.classes()).toContain("collapsed");

    await wrapper.find(".task-card .move-next").trigger("click");
    await flushPromises();

    expect(api).toHaveBeenCalledWith(
      "/api/inputs/idea-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(reviewing!.classes()).not.toContain("collapsed");
    expect(reviewing!.text()).toContain("Add a dark mode toggle");
  });
});
