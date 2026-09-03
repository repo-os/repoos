import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import IntegrationStatusBar from "../src/components/IntegrationStatusBar.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { IntegrationPipelineSnapshot } from "../src/types";

const activeSnapshot = (over: Partial<IntegrationPipelineSnapshot["active"]> = {}) =>
  ({
    empty: false,
    active: {
      taskId: "0042",
      stage: "check",
      failed: false,
      startedAt: new Date(Date.now() - 187_000).toISOString(),
      ...over,
    },
    queue: [],
    at: new Date().toISOString(),
  }) as IntegrationPipelineSnapshot;

const idleSnapshot = (): IntegrationPipelineSnapshot => ({
  empty: true,
  active: null,
  queue: [],
  at: new Date().toISOString(),
});

let pinia: Pinia;

function render() {
  return mount(IntegrationStatusBar, {
    global: { plugins: [pinia], stubs: { teleport: true } },
  });
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  vi.useFakeTimers({ now: new Date("2026-09-04T12:00:00Z") });
});

afterEach(() => {
  vi.useRealTimers();
  try {
    localStorage.clear();
  } catch {
    /* jsdom */
  }
});

describe("IntegrationStatusBar", () => {
  it("shows a live elapsed stopwatch while a task is integrating", async () => {
    const repo = useRepoStore();
    repo.integration = activeSnapshot();
    const wrapper = render();
    await nextTick();

    expect(wrapper.text()).toContain("3m 07s");

    vi.advanceTimersByTime(3000);
    await nextTick();
    expect(wrapper.text()).toContain("3m 10s");
  });

  it("does not auto-collapse while a job is active", async () => {
    const repo = useRepoStore();
    const ui = useUiStore();
    ui.setIntegrationBarCollapsed(false);
    repo.integration = activeSnapshot();
    render();
    await nextTick();

    vi.advanceTimersByTime(30_000);
    await nextTick();
    expect(ui.integrationBarCollapsed).toBe(false);
  });

  it("collapses ~10s after the pipeline goes idle", async () => {
    const repo = useRepoStore();
    const ui = useUiStore();
    ui.setIntegrationBarCollapsed(false);
    repo.integration = activeSnapshot();
    render();
    await nextTick();

    repo.integration = idleSnapshot();
    await nextTick();
    expect(ui.integrationBarCollapsed).toBe(false); // still open during the grace period

    vi.advanceTimersByTime(10_000);
    await nextTick();
    expect(ui.integrationBarCollapsed).toBe(true);
  });

  it("is minimised by default when mounted with an empty pipeline", async () => {
    const ui = useUiStore();
    ui.setIntegrationBarCollapsed(false);
    render();
    await nextTick();
    expect(ui.integrationBarCollapsed).toBe(true);
  });

  it("re-collapses 10s after the user expands an idle bar", async () => {
    const ui = useUiStore();
    const wrapper = render();
    await nextTick();
    expect(ui.integrationBarCollapsed).toBe(true);

    await wrapper.get(".ibar-strip").trigger("click");
    expect(ui.integrationBarCollapsed).toBe(false);

    vi.advanceTimersByTime(10_000);
    await nextTick();
    expect(ui.integrationBarCollapsed).toBe(true);
  });
});
