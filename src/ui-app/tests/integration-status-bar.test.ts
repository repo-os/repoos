import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import IntegrationStatusBar from "../src/components/IntegrationStatusBar.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { IntegrationPipelineSnapshot, Task } from "../src/types";

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

  it("builds the check tooltip from the repo's resolved check plan (#0458)", async () => {
    const repo = useRepoStore();
    repo.integration = {
      ...activeSnapshot(),
      checkPlan: {
        source: "declared",
        defaultProfile: "full",
        steps: [
          {
            name: "go-build",
            command: "go build ./...",
            timeoutMs: 600_000,
            required: true,
            dependsOn: [],
            profiles: [],
          },
          {
            name: "unit",
            kind: "tests",
            timeoutMs: 1_200_000,
            required: false,
            dependsOn: ["go-build"],
            profiles: [],
          },
        ],
      },
    };
    const wrapper = render();
    await nextTick();

    const title = wrapper.findAll(".stage")[3].attributes("title") ?? "";
    expect(title).toContain("2 step(s)");
    expect(title).toContain('profile "full"');
    expect(title).toContain("go-build: go build ./...");
    expect(title).toContain("timeout 10m");
    expect(title).toContain("unit: tests (built-in guard)");
    expect(title).toContain("after go-build");
    expect(title).toContain("optional");
    // The old hardcoded RepoOS prose must be gone.
    expect(title).not.toContain("1000+ tests");
  });

  it("falls back to a generic check tooltip when no plan resolved", async () => {
    const repo = useRepoStore();
    repo.integration = activeSnapshot();
    const wrapper = render();
    await nextTick();

    const title = wrapper.findAll(".stage")[3].attributes("title") ?? "";
    expect(title).toContain("No check plan was resolved");
  });

  it("clicking the check stage opens Debug focused on the merge-gate run", async () => {
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.integration = activeSnapshot();
    repo.tasks = [{ id: "0042", status: "review" } as Task];
    const wrapper = render();
    await nextTick();

    await wrapper.findAll(".stage")[3].trigger("click");
    expect(ui.activeTab).toBe("debug");
    expect(ui.debugView).toBe("logs");
    expect(ui.debugCheckFocus).toMatchObject({ taskId: "0042", kind: "merge-gate" });
  });

  it("clicking a non-check stage opens Debug without a check focus", async () => {
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.integration = activeSnapshot();
    repo.tasks = [{ id: "0042", status: "review" } as Task];
    const wrapper = render();
    await nextTick();

    await wrapper.findAll(".stage")[0].trigger("click");
    expect(ui.activeTab).toBe("debug");
    expect(ui.debugCheckFocus).toBeNull();
  });
});
