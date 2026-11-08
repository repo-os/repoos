/**
 * #1058 — running card hints drop inline "active …" recency; popover carries it.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import PipelineCard from "../src/components/PipelineCard.vue";
import { useRepoStore } from "../src/stores/repo";
import type { Task } from "../src/types";
import { STUCK_SILENCE_MS } from "../src/lib/retryHints";

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

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  vi.useFakeTimers({ now: new Date("2026-11-08T03:00:00.000Z") });
});

afterEach(() => {
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
});

describe("PipelineCard activity recency (#1058)", () => {
  it("hides elapsed inline for ok state and exposes it on the step tooltip", () => {
    const wrapper = mount(PipelineCard, {
      props: {
        taskId: "1058",
        type: "chore",
        priority: "p3",
        title: "Fixture",
        state: "ok",
        stepLabel: "Coding",
        chipText: null,
        stateSince: "2026-11-08T02:48:00.000Z",
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
    expect(tip).toContain("In this state for 12m");
  });

  it("keeps elapsed visible for stuck state", () => {
    const wrapper = mount(PipelineCard, {
      props: {
        taskId: "1058",
        type: "chore",
        priority: "p3",
        title: "Fixture",
        state: "stuck",
        stepLabel: "Coding",
        chipText: "Stuck",
        stateSince: "2026-11-08T02:48:00.000Z",
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
});
