/**
 * Check Runs panel loading + revisit behaviour (#0950): the default Checks tab
 * must never sit on a bare "Loading run history…" line, must show the last run
 * history instantly on a revisit, and must keep it visible when the background
 * refresh fails.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import * as apiMod from "../src/api";
import CheckRunsPanel from "../src/components/CheckRunsPanel.vue";
import { invalidatePageDataPrefix } from "../src/composables/page-data-cache";

const api = vi.spyOn(apiMod, "api");

function run(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    taskId: "0950",
    phase: "pre-review",
    worktree: null,
    machine: "bee",
    remote: false,
    scope: "full",
    startedAt: "2026-10-25T00:00:00Z",
    durationMs: 4000,
    outcome: "pass",
    failedStep: null,
    skippedSteps: [],
    failedTests: [],
    detail: null,
    ...over,
  };
}

function runHistory() {
  return { ok: true, runs: [run()] };
}

beforeEach(() => {
  invalidatePageDataPrefix("check-runs:");
});

afterEach(() => {
  api.mockReset();
});

describe("CheckRunsPanel loading (#0950)", () => {
  it("shows a skeleton instead of a bare loading line on first load", async () => {
    api.mockImplementation(() => new Promise(() => {}));
    const wrapper = mount(CheckRunsPanel);

    expect(wrapper.find(".page-skeleton").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Loading run history");
    expect(wrapper.find(".cr-table").exists()).toBe(false);
    wrapper.unmount();
  });

  it("renders the cached history immediately on revisit and applies the refresh in place", async () => {
    api.mockImplementation(() => Promise.resolve(runHistory()));
    const first = mount(CheckRunsPanel);
    await flushPromises();
    expect(first.find(".cr-table").exists()).toBe(true);
    first.unmount();

    let finish!: (value: unknown) => void;
    api.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const wrapper = mount(CheckRunsPanel);
    await nextTick();

    expect(wrapper.find(".page-skeleton").exists()).toBe(false);
    expect(wrapper.find(".cr-table").exists()).toBe(true);
    expect(wrapper.text()).toContain("1 run");

    finish({ ok: true, runs: [run(), run({ id: 2, taskId: "0955", outcome: "fail" })] });
    await flushPromises();
    expect(wrapper.text()).toContain("2 runs");
    expect(wrapper.find(".page-skeleton").exists()).toBe(false);
    wrapper.unmount();
  });

  it("keeps the cached history visible and shows a non-blocking refresh error", async () => {
    api.mockImplementation(() => Promise.resolve(runHistory()));
    const first = mount(CheckRunsPanel);
    await flushPromises();
    first.unmount();

    api.mockImplementation(() => Promise.reject(new Error("refresh boom")));
    const wrapper = mount(CheckRunsPanel);
    await flushPromises();

    expect(wrapper.find(".cr-table").exists()).toBe(true);
    expect(wrapper.text()).toContain("1 run");
    expect(wrapper.text()).toContain("Refresh failed");
    expect(wrapper.find(".page-skeleton").exists()).toBe(false);
    wrapper.unmount();
  });

  it("does not start a second request when a refresh is already in flight", async () => {
    let started = 0;
    let finish!: (value: unknown) => void;
    api.mockImplementation(() => {
      started += 1;
      return new Promise((resolve) => (finish = resolve));
    });

    const first = mount(CheckRunsPanel);
    const second = mount(CheckRunsPanel);
    await nextTick();
    expect(started).toBe(1);

    finish(runHistory());
    await flushPromises();
    expect(first.find(".cr-table").exists()).toBe(true);
    expect(second.find(".cr-table").exists()).toBe(true);
    first.unmount();
    second.unmount();
  });
});
