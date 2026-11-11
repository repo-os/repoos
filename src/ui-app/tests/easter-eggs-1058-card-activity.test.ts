/**
 * #1058 — running card hints drop inline "active …" recency; popover carries it.
 */
import { describe, expect, it, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import PipelineCard from "../src/components/PipelineCard.vue";
import { useRepoStore } from "../src/stores/repo";
import type { Task } from "../src/types";
import { STUCK_SILENCE_MS } from "../src/lib/retryHints";
import { installTooltips } from "../src/lib/tooltip";

function baseTask(over: Partial<Task> = {}): Task {
  return {
    id: "1058",
    title: "Card activity fixture",
    type: "chore",
    status: "active",
    priority: "p3",
    area: "web",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "feat/x",
    tags: [],
    needsInput: false,
    needsMerge: false,
    created_at: null,
    updated_at: null,
    path: "work/1058-fixture.md",
    absPath: "/tmp/1058.md",
    body: "",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: true,
      worktreeExists: true,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: "/tmp/wt",
      dirty: false,
    },
    preview: null,
    automaticReview: { running: false, enabled: true },
    ...over,
  } as Task;
}

let pinia: Pinia;

const healthyPipelineSignals = {
  handoffInFlight: false,
  checkInFlight: false,
  remoteValidationInFlight: false,
  queued: false,
  running: true,
  paused: false,
  stuckSignal: false,
  quietForMs: 60_000,
  nowMs: Date.parse("2026-11-08T03:00:00.000Z"),
};

beforeAll(() => {
  installTooltips();
});

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  vi.useFakeTimers({ now: new Date("2026-11-08T03:00:00.000Z") });
});

afterEach(() => {
  document.dispatchEvent(new Event("scroll", { bubbles: true }));
  vi.useRealTimers();
});

describe("TaskCard activity recency (#1058)", () => {
  it("shows coding without inline active recency and puts it on data-tip", async () => {
    const repo = useRepoStore();
    repo.runningIds = ["1058"];
    repo.runningSince = { "1058": "2026-11-08T02:59:00.000Z" };
    repo.agentActivityAt = { "1058": "2026-11-08T02:59:00.000Z" };
    const wrapper = mount(TaskCard, {
      props: { task: baseTask(), dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await nextTick();
    const hint = wrapper.get('[data-test-id="task-card-agent-hint"]');
    expect(hint.text().toLowerCase()).toBe("coding");
    expect(hint.text().toLowerCase()).not.toContain("active");
    const tip = hint.attributes("data-tip") ?? "";
    expect(tip).toMatch(/Active .*ago/i);
    expect(tip).toContain("Agent is making code changes");
  });

  it.each(["hover", "focus"] as const)("shows recency on %s", async (mode) => {
    const repo = useRepoStore();
    repo.runningIds = ["1058"];
    repo.runningSince = { "1058": "2026-11-08T02:59:00.000Z" };
    repo.agentActivityAt = { "1058": "2026-11-08T02:59:00.000Z" };
    const wrapper = mount(TaskCard, {
      props: { task: baseTask(), dragEnabled: false },
      attachTo: document.body,
      global: { plugins: [pinia] },
    });
    await nextTick();
    const hint = wrapper.get('[data-test-id="task-card-agent-hint"]').element;
    hint.dispatchEvent(
      mode === "hover"
        ? new MouseEvent("mouseover", { bubbles: true })
        : new FocusEvent("focusin", { bubbles: true }),
    );
    vi.advanceTimersByTime(mode === "hover" ? 350 : 0);
    expect(document.querySelector(".app-tooltip.show")?.textContent).toMatch(/Active .*ago/i);
    wrapper.unmount();
    document.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  it("keeps stuck · silent on the line", async () => {
    const repo = useRepoStore();
    repo.runningIds = ["1058"];
    const silentAt = new Date(Date.now() - STUCK_SILENCE_MS - 60_000).toISOString();
    repo.agentActivityAt = { "1058": silentAt };
    repo.runningSince = { "1058": silentAt };
    const wrapper = mount(TaskCard, {
      props: { task: baseTask(), dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await nextTick();
    const hint = wrapper.get('[data-test-id="task-card-agent-hint"]');
    expect(hint.text().toLowerCase()).toMatch(/stuck · silent/);
  });

  it("keeps last-activity recency available on the check-progress line", async () => {
    const repo = useRepoStore();
    repo.runningIds = ["1058"];
    repo.runningSince = { "1058": "2026-11-08T02:59:00.000Z" };
    repo.agentActivityAt = { "1058": "2026-11-08T02:59:00.000Z" };
    repo.taskChecks = {
      "1058": [
        {
          id: "check-1058",
          taskId: "1058",
          kind: "handoff-finalize",
          startedAt: "2026-11-08T02:59:00.000Z",
          finishedAt: null,
          durationMs: null,
          running: true,
          passed: null,
          code: null,
          output: "",
          scope: "changed:main",
          machine: "local",
        },
      ],
    };
    const wrapper = mount(TaskCard, {
      props: { task: baseTask(), dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await nextTick();
    const progress = wrapper.get(".task-card-check-progress-tip");
    expect(progress.attributes("data-tip")).toMatch(/Active 1m ago/i);
    expect(progress.attributes("tabindex")).toBe("0");
  });

  it("falls back from invalid activity to runningSince, then to task state time", async () => {
    const repo = useRepoStore();
    repo.runningIds = ["1058"];
    repo.agentActivityAt = { "1058": "invalid" };
    repo.runningSince = { "1058": "2026-11-08T02:59:00.000Z" };
    const runningSinceWrapper = mount(TaskCard, {
      props: { task: baseTask({ updated_at: "2026-11-08T02:40:00.000Z" }), dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await nextTick();
    expect(
      runningSinceWrapper.get('[data-test-id="task-card-agent-hint"]').attributes("data-tip"),
    ).toMatch(/Active 1m ago/i);
    runningSinceWrapper.unmount();

    repo.agentActivityAt = { "1058": "invalid" };
    repo.runningSince = { "1058": "also invalid" };
    const stateTimeWrapper = mount(TaskCard, {
      props: { task: baseTask({ updated_at: "2026-11-08T02:48:00.000Z" }), dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await nextTick();
    expect(
      stateTimeWrapper.get('[data-test-id="task-card-agent-hint"]').attributes("data-tip"),
    ).toMatch(/In this state for 12m/i);
  });

  it("uses task state time on check progress when activity timestamps are unusable", async () => {
    const repo = useRepoStore();
    repo.runningIds = ["1058"];
    repo.agentActivityAt = { "1058": "invalid" };
    repo.runningSince = { "1058": "also invalid" };
    repo.taskChecks = {
      "1058": [
        {
          id: "check-state-time",
          taskId: "1058",
          kind: "handoff-finalize",
          startedAt: "2026-11-08T02:59:00.000Z",
          finishedAt: null,
          durationMs: null,
          running: true,
          passed: null,
          code: null,
          output: "",
          scope: "changed:main",
          machine: "local",
        },
      ],
    };
    const wrapper = mount(TaskCard, {
      props: { task: baseTask({ updated_at: "2026-11-08T02:48:00.000Z" }), dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await nextTick();
    expect(wrapper.get(".task-card-check-progress-tip").attributes("data-tip")).toMatch(
      /In this state for 12m/i,
    );
  });

  it("shows last-activity recency while confirming handoff", async () => {
    const repo = useRepoStore();
    repo.agentActivityAt = { "1058": "2026-11-08T02:59:00.000Z" };
    const wrapper = mount(TaskCard, {
      props: { task: baseTask({ pendingHandoff: true }), dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await nextTick();
    const hint = wrapper.get('[data-test-id="task-card-agent-hint"]');
    expect(hint.text()).toContain("Confirming handoff");
    expect(hint.attributes("data-tip")).toMatch(/Active 1m ago/i);
    expect(hint.attributes("tabindex")).toBe("0");
  });
});

describe("PipelineCard activity recency (#1058)", () => {
  const pipelineLane = {
    pipelineStage: "coding" as const,
    reviewRunning: false,
    closeoutActive: false,
  };

  it("hides elapsed inline for ok state and exposes it on the step tooltip", () => {
    const wrapper = mount(PipelineCard, {
      props: {
        ...pipelineLane,
        taskId: "1058",
        type: "chore",
        priority: "p3",
        title: "Fixture",
        state: "ok",
        statusSignals: healthyPipelineSignals,
        stepLabel: "Coding",
        chipText: null,
        stateSince: "2026-11-08T02:48:00.000Z",
        lastActivityAt: "2026-11-08T02:59:00.000Z",
        nowMs: Date.parse("2026-11-08T03:00:00.000Z"),
        roundsLabel: "D0 · R0",
        reviewerTone: null,
        modelsLabel: "eng / rev",
        hostLabel: "local",
        action: null,
        checkProgress: null,
      },
    });
    expect(wrapper.find('[data-test-id="pipeline-card-elapsed"]').exists()).toBe(false);
    const step = wrapper.get(".pl-step");
    const tip = step.attributes("data-tip") ?? "";
    expect(tip).toMatch(/Active 1m ago/i);
    expect(tip).not.toContain("In this state");
  });

  it("keeps elapsed visible for stuck state", () => {
    const wrapper = mount(PipelineCard, {
      props: {
        ...pipelineLane,
        taskId: "1058",
        type: "chore",
        priority: "p3",
        title: "Fixture",
        state: "stuck",
        statusSignals: null,
        stepLabel: "Coding",
        chipText: "Stuck",
        stateSince: "2026-11-08T02:48:00.000Z",
        lastActivityAt: "2026-11-08T02:59:00.000Z",
        nowMs: Date.parse("2026-11-08T03:00:00.000Z"),
        roundsLabel: "D0 · R0",
        reviewerTone: null,
        modelsLabel: "eng / rev",
        hostLabel: "local",
        action: null,
        checkProgress: null,
      },
    });
    expect(wrapper.get('[data-test-id="pipeline-card-elapsed"]').text()).toBe("12m");
  });

  it.each([
    { lastActivityAt: null, checkProgress: null, path: "status" },
    { lastActivityAt: "invalid", checkProgress: null, path: "status" },
    {
      lastActivityAt: null,
      checkProgress: { stepsDone: 1, stepsTotal: 2 },
      path: "check progress",
    },
    {
      lastActivityAt: "invalid",
      checkProgress: { stepsDone: 1, stepsTotal: 2 },
      path: "check progress",
    },
  ])(
    "keeps elapsed inline on $path when last activity is $lastActivityAt",
    ({ lastActivityAt, checkProgress }) => {
      const wrapper = mount(PipelineCard, {
        props: {
          ...pipelineLane,
          taskId: "1058",
          type: "chore",
          priority: "p3",
          title: "Fixture",
          state: "ok",
          statusSignals: healthyPipelineSignals,
          stepLabel: "Coding",
          chipText: null,
          stateSince: "2026-11-08T02:48:00.000Z",
          lastActivityAt,
          nowMs: Date.parse("2026-11-08T03:00:00.000Z"),
          roundsLabel: "D0 · R0",
          reviewerTone: null,
          modelsLabel: "eng / rev",
          hostLabel: "local",
          action: null,
          checkProgress,
        },
      });
      expect(wrapper.get('[data-test-id="pipeline-card-elapsed"]').text()).toBe("12m");
      const tipTarget = checkProgress
        ? wrapper.get('[data-test-id="pipeline-card-check-progress"]')
        : wrapper.get(".pl-step");
      expect(tipTarget.attributes("data-tip")).toBeUndefined();
    },
  );

  it("shows stuck and elapsed time for a silent agent that still reports running", () => {
    const wrapper = mount(PipelineCard, {
      props: {
        ...pipelineLane,
        taskId: "1058",
        type: "chore",
        priority: "p3",
        title: "Fixture",
        state: "ok",
        statusSignals: {
          handoffInFlight: false,
          checkInFlight: false,
          remoteValidationInFlight: false,
          queued: false,
          running: true,
          paused: false,
          stuckSignal: true,
          quietForMs: 4 * 60_000,
          nowMs: Date.parse("2026-11-08T03:00:00.000Z"),
        },
        stepLabel: "Coding",
        chipText: null,
        stateSince: "2026-11-08T02:48:00.000Z",
        lastActivityAt: "2026-11-08T02:56:00.000Z",
        nowMs: Date.parse("2026-11-08T03:00:00.000Z"),
        roundsLabel: "D0 · R0",
        reviewerTone: null,
        modelsLabel: "eng / rev",
        hostLabel: "local",
        action: null,
        checkProgress: null,
      },
    });
    expect(wrapper.get(".pl-status-chip").text()).toBe("Stuck");
    expect(wrapper.get('[data-test-id="pipeline-card-elapsed"]').text()).toBe("12m");
  });

  it.each(["review", "close-out"])("keeps elapsed inline on idle %s rows", (kind) => {
    const wrapper = mount(PipelineCard, {
      props: {
        ...pipelineLane,
        pipelineStage: kind === "review" ? "review" : "closeout",
        taskId: "1058",
        type: "chore",
        priority: "p3",
        title: "Fixture",
        state: "ok",
        statusSignals: null,
        stepLabel: kind === "review" ? "In review" : "Closing out",
        chipText: null,
        stateSince: "2026-11-08T02:48:00.000Z",
        lastActivityAt: null,
        nowMs: Date.parse("2026-11-08T03:00:00.000Z"),
        roundsLabel: "D0 · R0",
        reviewerTone: null,
        modelsLabel: "eng / rev",
        hostLabel: "local",
        action: null,
        checkProgress: null,
      },
    });
    expect(wrapper.get('[data-test-id="pipeline-card-elapsed"]').text()).toBe("12m");
  });

  it("keeps last-activity recency available on check progress", () => {
    const wrapper = mount(PipelineCard, {
      props: {
        ...pipelineLane,
        taskId: "1058",
        type: "chore",
        priority: "p3",
        title: "Fixture",
        state: "ok",
        statusSignals: healthyPipelineSignals,
        stepLabel: "Running checks",
        chipText: null,
        stateSince: "2026-11-08T02:48:00.000Z",
        lastActivityAt: "2026-11-08T02:59:00.000Z",
        nowMs: Date.parse("2026-11-08T03:00:00.000Z"),
        roundsLabel: "D0 · R0",
        reviewerTone: null,
        modelsLabel: "eng / rev",
        hostLabel: "local",
        action: null,
        checkProgress: { stepsDone: 1, stepsTotal: 2 },
      },
    });
    expect(
      wrapper.get('[data-test-id="pipeline-card-check-progress"]').attributes("data-tip"),
    ).toMatch(/Active 1m ago/i);
  });
});
