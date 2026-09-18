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

async function mountView(inputs: Input[] = [makeInput()]): Promise<VueWrapper> {
  api.mockImplementation(async (path: string) => {
    if (path === "/api/inputs") return inputs;
    throw new Error("unexpected api: " + path);
  });
  const wrapper = mount(InputsView, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  localStorage.clear();
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
    const wrapper = await mountView();

    const col = wrapper.find(".board-col");
    expect(col.classes()).not.toContain("collapsed");
    await col.find(".col-head").trigger("click");
    expect(col.classes()).toContain("collapsed");
    expect(JSON.parse(localStorage.getItem("repoos.inputs.board.collapsed")!)).toContain("new");
  });
});
