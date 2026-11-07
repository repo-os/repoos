/**
 * Pipeline view (#1035): card lines come from the same data the task panel
 * uses, card clicks open the panel while the action icon does not, and the
 * Board | Pipeline toggle persists with Board unchanged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import PipelineCard from "../src/components/PipelineCard.vue";
import PipelineView from "../src/components/PipelineView.vue";
import WorkView from "../src/views/WorkView.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import {
  pipelineHostLabel,
  pipelineModelsLabel,
  pipelineRoundLabel,
  reviewerChip,
  taskInDevPass,
  taskRoundCounts,
} from "../src/lib/pipeline-card";
import { makeTask } from "./component-test-helpers";

const routeQuery = vi.hoisted(() => ({ query: {} as Record<string, string> }));
vi.mock("vue-router", () => ({
  useRoute: () => routeQuery,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

let mounted: VueWrapper[] = [];
function track(w: VueWrapper): VueWrapper {
  mounted.push(w);
  return w;
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  routeQuery.query = {};
  for (const w of mounted.splice(0)) w.unmount();
});

describe("pipeline-card lib", () => {
  it("counts rounds the way the task panel does", () => {
    const task = makeTask({ status: "active", branch: "feat/x", extra: { review_passes: 1 } });
    expect(taskRoundCounts(task, taskInDevPass(task, true))).toEqual({ dev: 2, review: 1 });
    const idle = makeTask({ status: "review", branch: "feat/x", extra: { review_passes: 1 } });
    expect(taskRoundCounts(idle, taskInDevPass(idle, false))).toEqual({ dev: 1, review: 1 });
    const draft = makeTask({ status: "draft", branch: "" });
    expect(taskRoundCounts(draft, false)).toEqual({ dev: 0, review: 0 });
    const errors = makeTask({
      status: "active",
      branch: "feat/x",
      needsInput: true,
      extra: { dev_error_count: 1 },
    });
    // A fresh error marks the counted round as still open — not a new pass.
    expect(taskRoundCounts(errors, taskInDevPass(errors, false))).toEqual({ dev: 1, review: 0 });
  });

  it("renders reviewer chips per verdict tone", () => {
    const counts = { dev: 4, review: 2 };
    expect(reviewerChip({ counts, tone: "green", reviewRunning: false })).toBe("D4 · R2 ✓");
    expect(reviewerChip({ counts, tone: "amber", reviewRunning: false })).toBe("D4 · R2");
    expect(reviewerChip({ counts, tone: "red", reviewRunning: false })).toBe("D4 · R2 ↻");
    expect(reviewerChip({ counts, tone: null, reviewRunning: true })).toBe("D4 · R3 …");
    expect(reviewerChip({ counts, tone: null, reviewRunning: false })).toBe("D4 · R2");
    expect(
      pipelineRoundLabel({ dev: 14, review: 3 }, { tone: "amber", reviewRunning: false }),
    ).toBe("D14 · R3");
    expect(pipelineRoundLabel({ dev: 4, review: 2 }, { tone: "green", reviewRunning: false })).toBe(
      "D4 · R2 ✓",
    );
    expect(pipelineRoundLabel({ dev: 4, review: 2 }, { tone: "red", reviewRunning: false })).toBe(
      "D4 · R2 ↻",
    );
    expect(pipelineRoundLabel({ dev: 4, review: 2 }, { tone: null, reviewRunning: true })).toBe(
      "D4 · R3 …",
    );
    expect(
      pipelineRoundLabel({ dev: 14, review: 3 }, { tone: "amber", reviewRunning: false }),
    ).toHaveLength(8);
  });

  it("labels models and host without inventing data", () => {
    expect(pipelineModelsLabel("opencode/spark", "opencode/spark")).toBe("spark");
    expect(pipelineModelsLabel("a/long-model", "b/other")).toBe("long-model · other");
    expect(pipelineHostLabel("bee", null)).toBe("bee");
    expect(pipelineHostLabel(null, null)).toBe("this Mac");
  });
});

describe("PipelineCard", () => {
  function cardProps(over: Record<string, unknown> = {}) {
    return {
      taskId: "1035",
      type: "feature",
      priority: "p2",
      title: "Pipeline view for the work page",
      state: "ok",
      stepLabel: "Coding",
      chipText: null,
      stateSince: new Date(Date.now() - 12 * 60_000).toISOString(),
      nowMs: Date.now(),
      roundsLabel: "D2 · R1 ✓",
      reviewerTone: "green",
      modelsLabel: "spark",
      hostLabel: "this Mac",
      action: { icon: "pause", label: "Pause work on task 1035" },
      checkProgress: null,
      ...over,
    } as never;
  }

  it("shows a determinate bar when check counts exist", () => {
    const wrapper = track(
      mount(PipelineCard, {
        props: cardProps({
          stepLabel: "Running checks 3/680",
          checkProgress: { stepsDone: null, stepsTotal: null, testsDone: 3, testsTotal: 680 },
        }),
      }),
    );
    expect(wrapper.find('[data-test-id="pipeline-card-check-progress"] progress').exists()).toBe(
      true,
    );
  });

  it("renders four rows with rounds, models and host", () => {
    const wrapper = track(mount(PipelineCard, { props: cardProps() }));
    expect(wrapper.find(".pl-row-1").text()).toContain("#1035");
    expect(wrapper.find(".pl-row-2").text()).toContain("Pipeline view");
    expect(wrapper.find(".pl-row-3").text()).toContain("Coding");
    const row4 = wrapper.find(".pl-row-4").text();
    expect(row4).toContain("D2 · R1 ✓");
    expect(wrapper.find(".pl-round").classes()).toContain("rounds-badge");
    expect(row4).toContain("spark");
    expect(row4).toContain("this Mac");
  });

  it("uses a coloured chip for stuck instead of dot plus step", () => {
    const wrapper = track(
      mount(PipelineCard, { props: cardProps({ state: "stuck", chipText: "Stuck" }) }),
    );
    expect(wrapper.find(".pl-status-chip").text()).toBe("Stuck");
    expect(wrapper.find(".pl-dot").exists()).toBe(false);
  });

  it("clicking the card opens the panel but the action icon does not", async () => {
    const wrapper = track(mount(PipelineCard, { props: cardProps() }));
    await wrapper.trigger("click");
    expect(wrapper.emitted("open")).toHaveLength(1);
    await wrapper.find(".pl-action").trigger("click");
    expect(wrapper.emitted("act")).toHaveLength(1);
    expect(wrapper.emitted("open")).toHaveLength(1);
  });

  it("is keyboard reachable with no native title tooltips", async () => {
    const wrapper = track(mount(PipelineCard, { props: cardProps() }));
    expect(wrapper.attributes("tabindex")).toBe("0");
    const action = wrapper.find(".pl-action");
    expect(action.element.tagName).toBe("BUTTON");
    expect(action.attributes("aria-label")).toBe("Pause work on task 1035");
    expect(action.attributes("title")).toBeUndefined();
    await wrapper.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("open")).toHaveLength(1);
  });
});

describe("PipelineView", () => {
  function seedBoard(): void {
    const repo = useRepoStore();
    repo.tasks = [
      makeTask({
        id: "1001",
        title: "Coding lane",
        status: "active",
        priority: "p1",
        branch: "feat/coding",
        created_at: "2026-11-01T10:00:00Z",
        updated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      }),
      makeTask({
        id: "1002",
        title: "Review lane",
        status: "review",
        priority: "p2",
        branch: "feat/review",
        created_at: "2026-11-02T10:00:00Z",
        updated_at: new Date(Date.now() - 9 * 60_000).toISOString(),
      }),
      makeTask({
        id: "1003",
        title: "Inbox task stays off the track",
        status: "inbox",
        priority: "p0",
      }),
    ] as never;
    repo.runningIds = ["1001"];
    repo.agentActivityAt = { "1001": new Date().toISOString() };
  }

  it("places active and review tasks on the track and opens the panel on click", async () => {
    setActivePinia(createPinia());
    seedBoard();
    const ui = useUiStore();
    const openSpy = vi.spyOn(ui, "openTask").mockResolvedValue(undefined as never);
    const wrapper = track(mount(PipelineView, { attachTo: document.body }));
    const cards = wrapper.findAll(".pipeline-card");
    expect(cards).toHaveLength(2);
    const codingCell = cards[0].element.parentElement;
    expect(codingCell?.className).toContain("stage-coding");
    const reviewCell = cards[1].element.parentElement;
    expect(reviewCell?.className).toContain("stage-review");
    await cards[0].trigger("click");
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toMatchObject({ id: "1001" });
  });

  it("orders lanes by priority, then longest in flight", () => {
    setActivePinia(createPinia());
    const repo = useRepoStore();
    repo.tasks = [
      makeTask({
        id: "2001",
        title: "newer p1",
        status: "active",
        priority: "p1",
        created_at: "2026-11-03T10:00:00Z",
        updated_at: new Date().toISOString(),
      }),
      makeTask({
        id: "2002",
        title: "older p1",
        status: "active",
        priority: "p1",
        created_at: "2026-11-01T10:00:00Z",
        updated_at: new Date().toISOString(),
      }),
      makeTask({
        id: "2003",
        title: "p0 wins",
        status: "active",
        priority: "p0",
        created_at: "2026-11-03T10:00:00Z",
        updated_at: new Date().toISOString(),
      }),
    ] as never;
    const wrapper = track(mount(PipelineView));
    const ids = wrapper.findAll(".pipeline-card").map((c) => c.attributes("data-task-id"));
    expect(ids).toEqual(["2003", "2002", "2001"]);
  });
});

describe("WorkView toggle", () => {
  function mountWork() {
    return track(
      mount(WorkView, {
        attachTo: document.body,
        global: {
          stubs: {
            BoardColumn: { template: "<div class='stub-board' />" },
            PipelineView: { template: "<div class='stub-pipeline' />" },
            IntegrationStatusBar: { template: "<div />" },
            Button: { template: "<button><slot /></button>" },
            Select: { template: "<div><slot /></div>" },
            SelectTrigger: { template: "<div><slot /></div>" },
            SelectValue: { template: "<div />" },
            SelectContent: { template: "<div><slot /></div>" },
            SelectViewport: { template: "<div><slot /></div>" },
            SelectItem: { template: "<div><slot /></div>" },
            "router-link": { template: "<a><slot /></a>" },
          },
        },
      }),
    );
  }

  it("defaults to Board and persists the Pipeline choice", async () => {
    const wrapper = mountWork();
    expect(wrapper.find(".stub-board").exists()).toBe(true);
    expect(wrapper.find(".stub-pipeline").exists()).toBe(false);
    const buttons = wrapper.findAll(".view-toggle-btn");
    expect(buttons.map((b) => b.text())).toEqual(["Pipeline", "Board"]);
    await buttons[0].trigger("click");
    expect(wrapper.find(".stub-pipeline").exists()).toBe(true);
    expect(wrapper.find(".stub-board").exists()).toBe(false);
    expect(localStorage.getItem("repoos.work.view-mode")).toBe("pipeline");
  });

  it("restores the stored choice on mount", async () => {
    localStorage.setItem("repoos.work.view-mode", "pipeline");
    const wrapper = mountWork();
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".stub-pipeline").exists()).toBe(true);
  });

  it("forces Pipeline on preview captures with pipeline shot routes", async () => {
    useRepoStore().health = { isPreviewBuild: true } as never;
    routeQuery.query = { shotState: "pipeline:checksProgress", tab: "pipeline" };
    const wrapper = mountWork();
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".stub-pipeline").exists()).toBe(true);
    expect(wrapper.find(".stub-board").exists()).toBe(false);
  });
});
