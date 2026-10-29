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
  it("shows the reused run id on a passing check without expanding the row", async () => {
    api.mockResolvedValue({
      ok: true,
      runs: [
        run({
          detail: "reused check 9822 — same clean commit and main base",
          skippedSteps: ["tests"],
        }),
      ],
    } as never);
    const wrapper = mount(CheckRunsPanel);
    await flushPromises();
    expect(wrapper.get('[data-test-id="reused-check"]').text()).toContain("reused check 9822");
    expect(wrapper.find(".cr-detail-row").exists()).toBe(false);
    wrapper.unmount();
  });

  it("shows a skeleton instead of a bare loading line on first load", async () => {
    api.mockImplementation(() => new Promise(() => {}));
    const wrapper = mount(CheckRunsPanel);

    expect(wrapper.find(".page-skeleton").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Loading run history");
    expect(wrapper.find(".cr-table").exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([{ rows: [] }, { rows: [run()] }])(
    "renders cached history with $rows while revalidating",
    async ({ rows }) => {
      api.mockResolvedValue({ ok: true, runs: rows } as never);
      const first = mount(CheckRunsPanel);
      await flushPromises();
      first.unmount();
      api.mockImplementation(() => new Promise(() => {}));
      const revisit = mount(CheckRunsPanel);
      await nextTick();
      expect(revisit.find(".page-skeleton").exists()).toBe(false);
      expect(revisit.find(rows.length ? ".cr-table" : ".cr-empty").exists()).toBe(true);
      revisit.unmount();
    },
  );

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

  it.each([{ rows: [] }, { rows: [run()] }])(
    "shows refresh errors with cached rows $rows",
    async ({ rows }) => {
      api.mockImplementation(() => Promise.resolve({ ok: true, runs: rows }));
      const first = mount(CheckRunsPanel);
      await flushPromises();
      first.unmount();

      api.mockImplementation(() => Promise.reject(new Error("refresh boom")));
      const wrapper = mount(CheckRunsPanel);
      await flushPromises();

      expect(wrapper.find(rows.length ? ".cr-table" : ".cr-empty").exists()).toBe(true);
      expect(wrapper.find(".cr-err").text()).toContain("refresh boom");
      expect(wrapper.find(".page-skeleton").exists()).toBe(false);
      wrapper.unmount();
    },
  );

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

describe("CheckRunsPanel step timings (#0970)", () => {
  it("reports measured steps and expands successful runs to show outcomes", async () => {
    api.mockResolvedValue({
      ok: true,
      runs: [
        run({
          steps: [
            { name: "build", status: "passed", durationMs: 2500 },
            { name: "contrast", status: "skipped", durationMs: 0 },
          ],
        }),
      ],
    });
    const wrapper = mount(CheckRunsPanel);
    await flushPromises();
    const report = wrapper.get('[aria-label="Step timing report"]');
    expect(report.text()).toContain("last 1 run");
    expect(report.text()).toContain("2.5s");
    expect(report.text()).toContain("0 / 1 (0%)");
    await wrapper.get("tr.cr-expandable").trigger("click");
    const detail = wrapper.get('[aria-label="Run step timings"]');
    expect(detail.text()).toContain("passed");
    expect(detail.text()).toContain("skipped");
    expect(wrapper.text()).not.toContain("Failed in");
    wrapper.unmount();
  });
});
