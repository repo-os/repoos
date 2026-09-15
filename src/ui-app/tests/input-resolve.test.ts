/**
 * Input resolve actions (#0359): the side panel can turn an input into a task
 * through the freeform/PM flow, or close it as "no action". The resolution is
 * persisted on the input so it survives a reload, and a PM failure leaves the
 * input exactly as it was.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import { useRepoStore } from "../src/stores/repo";
import { createInput, listInputs, resolveInput, updateInput } from "../../core/input";
import { createRepoOS } from "../../core/repoos";
import type { Input } from "../../core/input.js";
import InputsView from "../src/views/InputsView.vue";
import DialogContent from "../src/components/ui/dialog/content.vue";

const api = vi.spyOn(apiMod, "api");
const pushSpy = vi.fn(async () => {});

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn(), push: pushSpy }),
}));

function makeInput(overrides: Partial<Input> = {}): Input {
  return {
    id: "idea-1",
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

function stubApi(opts: {
  inputs: Input[];
  freeform?: unknown;
  resolved?: Input;
  resolveError?: boolean;
}): { resolveCalls: Array<Record<string, unknown>>; freeformCalls: string[] } {
  const resolveCalls: Array<Record<string, unknown>> = [];
  const freeformCalls: string[] = [];
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/inputs") return opts.inputs;
    if (path === "/api/tasks/freeform") {
      const body = init?.body ? (JSON.parse(String(init.body)) as { explanation: string }) : null;
      freeformCalls.push(body?.explanation ?? "");
      return opts.freeform;
    }
    if (path.endsWith("/resolve")) {
      resolveCalls.push(init?.body ? JSON.parse(String(init.body)) : {});
      if (opts.resolveError) throw new Error("resolve failed");
      return opts.resolved;
    }
    throw new Error("unexpected api: " + path);
  });
  return { resolveCalls, freeformCalls };
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = mount(InputsView, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

function drawer(wrapper: VueWrapper): VueWrapper {
  return wrapper.findComponent(DialogContent) as VueWrapper;
}

async function openFirstInput(wrapper: VueWrapper): Promise<void> {
  const row = wrapper.find(".input-row");
  expect(row.exists()).toBe(true);
  await row.trigger("click");
  await flushPromises();
}

function buttonTexts(wrapper: VueWrapper): string[] {
  return drawer(wrapper)
    .findAll("button")
    .map((b) => b.text().replace(/\s+/g, " ").trim());
}

beforeEach(() => {
  setActivePinia(createPinia());
  pushSpy.mockClear();
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("resolveInput (core persistence)", () => {
  it("persists a task resolution and parses it back on a reload", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-input-resolve-"));
    try {
      const config = createRepoOS(root).config;
      const created = createInput(config, "Add a dark mode toggle", "idea", "human");
      const resolved = resolveInput(config, created.id, "task", "0400");

      expect(resolved.status).toBe("processed");
      expect(resolved.resolution).toBe("task");
      expect(resolved.resolvedTask).toBe("0400");

      const reread = listInputs(config).find((i) => i.id === created.id)!;
      expect(reread.status).toBe("processed");
      expect(reread.resolution).toBe("task");
      expect(reread.resolvedTask).toBe("0400");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("records a no-action resolution with no task id", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-input-noaction-"));
    try {
      const config = createRepoOS(root).config;
      const created = createInput(config, "Maybe not worth doing", "idea", "human");
      const resolved = resolveInput(config, created.id, "none");

      expect(resolved.status).toBe("processed");
      expect(resolved.resolution).toBe("none");
      expect(resolved.resolvedTask).toBe("");
      expect(listInputs(config)[0].resolution).toBe("none");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("clears a stale resolution when the input is moved out of processed", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-input-clear-"));
    try {
      const config = createRepoOS(root).config;
      const created = createInput(config, "Add a dark mode toggle", "idea", "human");
      resolveInput(config, created.id, "task", "0400");
      const moved = updateInput(config, created.id, "reviewing");
      expect(moved.resolution).toBe("");
      expect(moved.resolvedTask).toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("inputs side-panel resolve actions (#0359)", () => {
  it("shows both actions for a non-processed input", async () => {
    stubApi({ inputs: [makeInput()] });
    const wrapper = await mountView();
    await openFirstInput(wrapper);

    expect(buttonTexts(wrapper)).toContain("Create task");
    expect(buttonTexts(wrapper)).toContain("Do nothing");
    wrapper.unmount();
  });

  it("Do nothing resolves the input and renders the no-action note", async () => {
    const input = makeInput();
    const { resolveCalls } = stubApi({
      inputs: [input],
      resolved: makeInput({ status: "processed", resolution: "none" }),
    });
    const wrapper = await mountView();
    await openFirstInput(wrapper);

    const btn = drawer(wrapper)
      .findAll("button")
      .find((b) => b.text().includes("Do nothing"));
    await btn!.trigger("click");
    await flushPromises();

    expect(resolveCalls).toHaveLength(1);
    expect(resolveCalls[0]).toEqual({ resolution: "none", taskId: "" });
    expect(drawer(wrapper).text()).toContain("No action taken.");
    // Terminal: the actions are gone.
    expect(buttonTexts(wrapper)).not.toContain("Do nothing");
    wrapper.unmount();
  });

  it("Create task routes the input body through the freeform PM flow, then resolves to the task", async () => {
    const input = makeInput();
    const { resolveCalls, freeformCalls } = stubApi({
      inputs: [input],
      freeform: { ok: true, fallback: false, task: { id: "0400", pmWorking: true } },
      resolved: makeInput({
        status: "processed",
        resolution: "task",
        resolvedTask: "0400",
      }),
    });
    const wrapper = await mountView();
    await openFirstInput(wrapper);

    const btn = drawer(wrapper)
      .findAll("button")
      .find((b) => b.text().includes("Create task"));
    await btn!.trigger("click");
    await flushPromises();

    expect(freeformCalls).toEqual([input.body]);
    expect(resolveCalls).toEqual([{ resolution: "task", taskId: "0400" }]);
    expect(drawer(wrapper).text()).toContain("task #0400");

    const link = drawer(wrapper)
      .findAll("button")
      .find((b) => b.text().includes("task #0400"));
    await link!.trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({ path: "/work", query: { task: "0400" } });
    wrapper.unmount();
  });

  it("a PM failure leaves the input actionable and shows the error", async () => {
    const input = makeInput();
    const { resolveCalls } = stubApi({
      inputs: [input],
      freeform: { ok: true, fallback: true, fallbackReason: "no-pm-agent", task: { id: "0401" } },
    });
    const wrapper = await mountView();
    await openFirstInput(wrapper);

    const btn = drawer(wrapper)
      .findAll("button")
      .find((b) => b.text().includes("Create task"));
    await btn!.trigger("click");
    await flushPromises();

    expect(resolveCalls).toHaveLength(0);
    expect(drawer(wrapper).find(".resolve-error").exists()).toBe(true);
    expect(drawer(wrapper).find(".resolve-error").text()).toContain("PM agent");
    // Still actionable.
    expect(buttonTexts(wrapper)).toContain("Create task");
    expect(buttonTexts(wrapper)).toContain("Do nothing");
    wrapper.unmount();
  });

  it("a processed input renders its task link after a reload", async () => {
    localStorage.setItem("inputs-filter-selected", JSON.stringify(["processed"]));
    stubApi({
      inputs: [makeInput({ status: "processed", resolution: "task", resolvedTask: "0400" })],
    });
    const wrapper = await mountView();
    await openFirstInput(wrapper);

    expect(drawer(wrapper).text()).toContain("Resolved by");
    expect(drawer(wrapper).text()).toContain("task #0400");
    expect(buttonTexts(wrapper)).not.toContain("Create task");
    wrapper.unmount();
  });

  it("a processed input with no recorded resolution is labelled honestly", async () => {
    localStorage.setItem("inputs-filter-selected", JSON.stringify(["processed"]));
    stubApi({ inputs: [makeInput({ status: "processed" })] });
    const wrapper = await mountView();
    await openFirstInput(wrapper);

    expect(drawer(wrapper).text()).toContain("No resolution recorded.");
    wrapper.unmount();
  });
});

describe("resolveInput store error surface", () => {
  it("throws when the resolve endpoint fails, so the caller can show it", async () => {
    const input = makeInput();
    stubApi({ inputs: [input], resolved: input, resolveError: true });
    const repo = useRepoStore();
    await expect(repo.resolveInput(input.id, "none")).rejects.toThrow("resolve failed");
  });
});
