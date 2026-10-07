import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
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
      lastProgressAt: new Date(Date.now() - 187_000).toISOString(),
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

  it("builds the check pane from the repo's resolved check plan (#0458)", async () => {
    const repo = useRepoStore();
    repo.integration = {
      ...activeSnapshot(),
      checkPlan: {
        source: "declared",
        defaultProfile: "full",
        errors: [],
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

    const checkStage = wrapper.findAll(".stage")[3];
    // The native tooltip is gone in favour of the pane.
    expect(checkStage.attributes("title")).toBeUndefined();

    await checkStage.trigger("mouseenter");
    const text = wrapper.get(".stage-pane").text();
    expect(text).toContain("2 step(s)");
    expect(text).toContain('profile "full"');
    expect(text).toContain("go-build: go build ./...");
    expect(text).toContain("timeout 10m");
    expect(text).toContain("unit: tests (built-in guard)");
    expect(text).toContain("after go-build");
    expect(text).toContain("optional");
    // The old hardcoded RepoOS prose must be gone.
    expect(text).not.toContain("1000+ tests");
  });

  it("falls back to the skipped-gate copy when no plan resolved (#0592)", async () => {
    const repo = useRepoStore();
    repo.integration = activeSnapshot();
    const wrapper = render();
    await nextTick();

    await wrapper.findAll(".stage")[3].trigger("mouseenter");
    const text = wrapper.get(".stage-pane").text();
    // #0592: nothing verifies here — the copy must say that plainly, offer
    // the print-plan command, and never suggest a pass.
    expect(text).toContain("nothing to verify");
    expect(text).toContain("repoos check --print-plan");
    expect(text).not.toContain("passed");
    expect(text).not.toContain("No check plan was resolved");
  });

  it("shows the no-checks reminder strip with a file-a-task action (#0592)", async () => {
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.integration = {
      ...activeSnapshot(),
      checkPlan: { source: "empty", defaultProfile: "default", steps: [], errors: [] },
    };
    ui.setIntegrationBarCollapsed(false);
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => {
      throw new Error("unexpected fetch: " + _url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = render();
    await nextTick();

    const strip = wrapper.get(".ibar-plan-empty");
    expect(strip.text()).toContain("No checks configured");
    expect(strip.text()).toContain("repoos check --print-plan");

    // The one-click action goes through the normal task-creation endpoint.
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      expect(String(_url)).toBe("/api/tasks");
      const body = JSON.parse(String(init?.body));
      expect(body.title).toContain("check.steps");
      expect(body.body).toContain("repoos check --print-plan");
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: "0600", title: body.title, status: "inbox" }),
      } as unknown as Response;
    });
    await wrapper.get(".ibar-plan-empty-btn").trigger("click");
    await flushPromises();
    await nextTick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("hides the no-checks reminder strip while nothing is integrating (#0592)", async () => {
    const repo = useRepoStore();
    repo.integration = {
      ...idleSnapshot(),
      checkPlan: { source: "empty", defaultProfile: "default", steps: [], errors: [] },
    };
    const wrapper = render();
    await nextTick();
    // Idle + auto-collapsed: the strip lives only in the expanded bar.
    expect(wrapper.find(".ibar-plan-empty").exists()).toBe(false);
  });

  it("withholds the no-checks strip when the plan is broken and says why in the tooltip (#0592)", async () => {
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.integration = {
      ...activeSnapshot(),
      checkPlan: {
        source: "empty",
        defaultProfile: "default",
        steps: [],
        errors: ["[check] declares [[check.steps]] but no row is usable"],
      },
    };
    ui.setIntegrationBarCollapsed(false);
    const wrapper = render();
    await nextTick();

    // A broken declared plan fails red — it is NOT "no checks configured".
    expect(wrapper.find(".ibar-plan-empty").exists()).toBe(false);

    await wrapper.findAll(".stage")[3].trigger("mouseenter");
    const text = wrapper.get(".stage-pane").text();
    expect(text).toMatch(/plan is broken/);
    expect(text).toContain("FAILS red");
    expect(text).toContain("no row is usable");
  });

  it("shows a stage's description in the pane and hides it on mouseleave (#0460)", async () => {
    const repo = useRepoStore();
    repo.integration = activeSnapshot();
    const wrapper = render();
    await nextTick();

    expect(wrapper.find(".stage-pane").exists()).toBe(false);

    await wrapper.findAll(".stage")[0].trigger("mouseenter");
    expect(wrapper.get(".stage-pane").text()).toContain("Syncing: fast-forwarding");

    // Moving straight to an adjacent stage swaps the copy without spawning a
    // second pane.
    await wrapper.findAll(".stage")[1].trigger("mouseenter");
    expect(wrapper.findAll(".stage-pane")).toHaveLength(1);
    expect(wrapper.get(".stage-pane").text()).toContain("Merge: merging the branch");

    // Leaving the stage row dismisses it.
    await wrapper.get(".stages").trigger("mouseleave");
    expect(wrapper.find(".stage-pane").exists()).toBe(false);
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

  it("pane width uses bar rendered width as min-width, capped at 80vw (#0465)", async () => {
    const repo = useRepoStore();
    repo.integration = activeSnapshot();
    Object.defineProperty(window, "innerWidth", {
      value: 1000,
      writable: true,
      configurable: true,
    });
    const wrapper = render();
    await nextTick();

    const barEl = wrapper.find(".ibar").element;
    vi.spyOn(barEl, "getBoundingClientRect").mockReturnValue({
      left: 200,
      right: 600,
      top: 700,
      bottom: 750,
      width: 400,
      height: 50,
      x: 200,
      y: 700,
      toJSON: () => {},
    } as DOMRect);

    await wrapper.findAll(".stage")[0].trigger("mouseenter");
    const pane = wrapper.find(".stage-pane");
    expect(pane.exists()).toBe(true);
    const style = pane.attributes("style");
    // min-width = bar width (400px), max-width = min(80vw, 1000-28) = 800px
    expect(style).toContain("min-width: 400px");
    expect(style).toContain("max-width: 800px");
  });

  it("pane width respects 80vw cap over bar width on narrow windows (#0465)", async () => {
    const repo = useRepoStore();
    repo.integration = activeSnapshot();
    Object.defineProperty(window, "innerWidth", { value: 500, writable: true, configurable: true });
    const wrapper = render();
    await nextTick();

    const barEl = wrapper.find(".ibar").element;
    vi.spyOn(barEl, "getBoundingClientRect").mockReturnValue({
      left: 20,
      right: 480,
      top: 700,
      bottom: 750,
      width: 460,
      height: 50,
      x: 20,
      y: 700,
      toJSON: () => {},
    } as DOMRect);

    await wrapper.findAll(".stage")[0].trigger("mouseenter");
    const pane = wrapper.find(".stage-pane");
    const style = pane.attributes("style");
    // min-width clamped to max-width (400px), max-width = min(80vw=400, 500-28=472) = 400px
    // The 80% cap wins over the bar width
    expect(style).toContain("min-width: 400px");
    expect(style).toContain("max-width: 400px");
  });

  it("renders elapsed time as a chip pill in expanded and minimised views (#0522)", async () => {
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.integration = activeSnapshot();
    ui.setIntegrationBarCollapsed(false);
    const expanded = render();
    await nextTick();

    const expandedChip = expanded.find(".ibar .ibar-chip");
    expect(expandedChip.exists()).toBe(true);
    expect(expandedChip.text()).toBe("3m 07s");

    ui.setIntegrationBarCollapsed(true);
    await nextTick();
    const stripChip = expanded.find(".ibar-strip .strip-label .ibar-chip");
    expect(stripChip.exists()).toBe(true);
    expect(stripChip.text()).toBe("3m 07s");
    expect(stripChip.classes().sort()).toEqual(expandedChip.classes().sort());
    const expandedStyle = getComputedStyle(expandedChip.element);
    const stripStyle = getComputedStyle(stripChip.element);
    expect(stripStyle.borderRadius).toBe(expandedStyle.borderRadius);
    expect(stripStyle.backgroundColor).toBe(expandedStyle.backgroundColor);
    expect(expanded.find(".strip-elapsed").exists()).toBe(false);
  });

  it("keeps the active-task label in the minimised strip when many tasks are queued (#0522)", async () => {
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.integration = {
      ...activeSnapshot(),
      queue: ["0455", "0456", "0457", "0458"],
    };
    ui.setIntegrationBarCollapsed(true);
    const wrapper = render();
    await nextTick();

    const label = wrapper.get(".strip-label");
    expect(label.text()).toContain("#0042");
    expect(label.text()).toContain("3m 07s");
    wrapper.get(".strip-queue-ellipsis");
    expect(wrapper.get(".ibar-strip").attributes("title")).toContain("Queue: #0455");
  });

  it("shows queued task ids as chips in expanded and minimised views (#0522)", async () => {
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.integration = {
      ...activeSnapshot(),
      queue: ["0455", "0456"],
    };
    ui.setIntegrationBarCollapsed(false);
    const wrapper = render();
    await nextTick();

    const expandedQueue = wrapper.find(".ibar-queue");
    expect(expandedQueue.text()).toContain("Queue:");
    expect(expandedQueue.text()).toContain("#0455");
    expect(expandedQueue.text()).toContain("#0456");
    expect(expandedQueue.text()).not.toContain("queueing");
    expect(wrapper.find(".queue-count").exists()).toBe(false);
    expect(expandedQueue.findAll(".ibar-chip")).toHaveLength(2);

    ui.setIntegrationBarCollapsed(true);
    await nextTick();
    const stripQueue = wrapper.find(".strip-queue");
    expect(stripQueue.exists()).toBe(true);
    expect(stripQueue.text()).toBe("Queue:#0455#0456");
    expect(stripQueue.findAll(".ibar-chip")).toHaveLength(2);
  });

  it("hides the minimised queue segment when nothing is queued (#0522)", async () => {
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.integration = activeSnapshot();
    ui.setIntegrationBarCollapsed(true);
    const wrapper = render();
    await nextTick();

    expect(wrapper.find(".strip-queue").exists()).toBe(false);
  });

  it("hides queue UI when integration failed (#0522)", async () => {
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.integration = {
      ...activeSnapshot({ failed: true, stage: "check" }),
      queue: ["0455"],
    };
    ui.setIntegrationBarCollapsed(true);
    const wrapper = render();
    await nextTick();

    expect(wrapper.find(".strip-queue").exists()).toBe(false);
    expect(wrapper.get(".ibar-strip").attributes("title")).not.toContain("Queue:");
  });

  it("includes queued ids in the minimised strip tooltip without an active job (#0522)", async () => {
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.integration = {
      empty: false,
      active: null,
      queue: ["0455", "0456"],
      at: new Date().toISOString(),
    };
    ui.setIntegrationBarCollapsed(true);
    const wrapper = render();
    await nextTick();

    expect(wrapper.get(".ibar-strip").attributes("title")).toContain("Queue: #0455 #0456");
    expect(wrapper.find(".strip-queue").exists()).toBe(true);
  });
});
