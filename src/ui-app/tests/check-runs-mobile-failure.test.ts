import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import CheckRunsPanel from "../src/components/CheckRunsPanel.vue";

const failedRun = {
  id: 1202,
  taskId: "1202",
  phase: "pre-review" as const,
  machine: "local",
  remote: false,
  scope: "changed:main",
  startedAt: "2026-11-19T00:00:00.000Z",
  durationMs: 42000,
  outcome: "fail" as const,
  failedStep: "rendered-contrast",
  skippedSteps: [],
  failedTests: [],
  detail: "Rendered contrast check failed.",
};

let pinia: ReturnType<typeof createPinia>;

describe("check run failures on narrow screens", () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, runs: [failedRun] }),
      })),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("repeats the failed step in the first visible run column on mobile", async () => {
    const wrapper = mount(CheckRunsPanel, {
      global: { plugins: [pinia], stubs: { FailedTestsList: true } },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    const summary = wrapper.get(".cr-mobile-failure");
    expect(summary.text()).toContain("Failed at rendered-contrast");
    expect(wrapper.get(".cr-outcome").text()).toContain("rendered-contrast");
    wrapper.unmount();
  });
});
