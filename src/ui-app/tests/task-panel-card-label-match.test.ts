/**
 * #1023 — the task panel's status heading is the board card's label for the
 * same task at the same moment. Covers the two states that drifted in the bug
 * report (checks running and confirming handoff) plus the close-out pill.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useUiStore } from "../src/stores/ui";
import { useRepoStore } from "../src/stores/repo";
import type { IntegrationPipelineSnapshot, Task, TaskCheckRun } from "../src/types";
import { EMPTY_COUNTS, FakeEventSource, flush, json, makeTask } from "./component-test-helpers";

function activeTask(over: Partial<Task> = {}): Task {
  return makeTask({
    status: "active",
    branch: "feat/status-summary",
    git: {
      branchExists: true,
      worktreeExists: true,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: "/tmp/repo/.worktrees/0001",
      dirty: false,
    },
    ...over,
  });
}

function runningCheck(over: Partial<TaskCheckRun> = {}): TaskCheckRun {
  return {
    id: "0001-handoff-finalize-1",
    taskId: "0001",
    kind: "handoff-finalize",
    startedAt: new Date(Date.now() - 70_000).toISOString(),
    finishedAt: null,
    durationMs: null,
    running: true,
    passed: null,
    code: null,
    output: "",
    scope: "changed:main",
    machine: "macbook",
    stepsDone: 3,
    stepsTotal: 8,
    currentStep: 4,
    stepName: "tests",
    testsDone: 24,
    testsTotal: 72,
    ...over,
  };
}

function pipeline(over: Partial<IntegrationPipelineSnapshot> = {}): IntegrationPipelineSnapshot {
  return {
    empty: false,
    active: {
      taskId: "0001",
      stage: "merge",
      failed: false,
      startedAt: new Date(Date.now() - 7 * 60_000).toISOString(),
      lastProgressAt: new Date().toISOString(),
    },
    queue: [],
    at: new Date().toISOString(),
    ...over,
  };
}

function stubApi(
  task: Task,
  opts: { reviewRunning?: boolean; review?: Record<string, unknown> | null } = {},
): void {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({
          tasks: [task],
          counts: { ...EMPTY_COUNTS, active: 1 },
          taskCount: 1,
        });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/review"))
        return json({
          ok: true,
          running: opts.reviewRunning ?? false,
          enabled: true,
          review: opts.review ?? null,
          lines: [],
        });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      return json({ ok: true });
    }),
  );
}

async function mountCard(pinia: Pinia, task: Task) {
  const wrapper = mount(TaskCard, {
    props: { task, dragEnabled: false },
    global: { plugins: [pinia] },
  });
  await nextTick();
  return wrapper;
}

async function mountDrawer(pinia: Pinia, task: Task) {
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  const ui = useUiStore();
  ui.open(task);
  const wrapper = mount(TaskDrawer, {
    global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
  });
  await flush();
  return wrapper;
}

function cardLabel(wrapper: Awaited<ReturnType<typeof mountCard>>): string {
  return wrapper.get('[data-test-id="task-card-agent-hint"]').text().trim();
}

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  FakeEventSource.instances = [];
  vi.useFakeTimers({ now: new Date("2026-11-04T09:00:00.000Z") });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("task panel status label matches the board card (#1023)", () => {
  it("names a running handoff check exactly as the card does", async () => {
    const task = activeTask();
    stubApi(task);
    const repo = useRepoStore();
    repo.handoffSteps[task.id] = "check";
    repo.taskChecks[task.id] = [runningCheck()];

    const card = await mountCard(pinia, task);
    const drawer = await mountDrawer(pinia, task);

    const expected = cardLabel(card);
    expect(expected).toMatch(/^running checks · check · /);
    expect(drawer.find(".drawer-status-l1").text()).toBe(expected);
    // A running state carries the Settings-selected activity animation.
    expect(drawer.find(".drawer-status-l1 .ai").exists()).toBe(true);
    expect(drawer.find('[data-test-id="close-out-check-progress"] progress').exists()).toBe(true);
    card.unmount();
    drawer.unmount();
  });

  it("treats a held local check slot as running when check history is empty", async () => {
    const task = activeTask();
    stubApi(task);
    const repo = useRepoStore();
    repo.taskChecks[task.id] = [];

    const card = await mountCard(pinia, task);
    const drawer = await mountDrawer(pinia, task);
    repo.localCheckSlotHolders = [
      {
        slot: 0,
        pid: 1234,
        ageMs: 8 * 60_000,
        heartbeatAgeMs: 2_000,
        dead: false,
        wedged: false,
        meta: { kind: "local-check", taskId: task.id },
      },
    ];
    await flush();

    const expected = cardLabel(card);
    expect(expected).toMatch(/^running checks · check · /);
    expect(drawer.find(".drawer-status-l1").text()).toBe(expected);
    expect(drawer.text()).not.toContain("Quiet — may be stalled");
    expect(drawer.text()).not.toContain("stuck · silent");
    const progress = drawer.find('[data-test-id="close-out-check-progress"] progress');
    expect(progress.exists()).toBe(true);
    expect(progress.attributes("value")).toBeUndefined();
    card.unmount();
    drawer.unmount();
  });

  it("uses persisted handoff status after reload when no check run or SSE step exists", async () => {
    const task = activeTask();
    stubApi(task);
    const repo = useRepoStore();
    repo.taskChecks[task.id] = [];

    const card = await mountCard(pinia, task);
    const drawer = await mountDrawer(pinia, task);
    repo.handoffStatuses[task.id] = {
      state: "running",
      step: "verify",
      startedAt: new Date(Date.now() - 75_000).toISOString(),
      updatedAt: new Date().toISOString(),
      attempt: 1,
      progress: null,
      machine: "fixture host",
    };
    await flush();

    const expected = cardLabel(card);
    expect(expected).toMatch(/^running checks · verify · /);
    expect(drawer.find(".drawer-status-l1").text()).toBe(expected);
    expect(drawer.text()).not.toContain("Quiet — may be stalled");
    expect(drawer.text()).not.toContain("stuck · silent");
    expect(card.find('[data-test-id="task-card-check-progress"] progress').exists()).toBe(true);
    expect(card.find('[data-test-id="task-card-check-progress"] progress').attributes("value")).toBeUndefined();
    expect(card.find('[data-test-id="task-card-check-progress"]').text()).toContain("attempt 1 · on fixture host");
    expect(drawer.find('[data-test-id="close-out-check-progress"]').text()).toContain("attempt 1");
    expect(drawer.find('[data-test-id="close-out-check-progress"]').text()).toContain("on fixture host");
    const progress = drawer.find('[data-test-id="close-out-check-progress"] progress');
    expect(progress.exists()).toBe(true);
    expect(progress.attributes("value")).toBeUndefined();
    card.unmount();
    drawer.unmount();
  });

  it("names confirming handoff exactly as the card does, with at most two rows", async () => {
    const task = activeTask();
    stubApi(task);
    const repo = useRepoStore();
    repo.handoffSteps[task.id] = "check";

    const card = await mountCard(pinia, task);
    const drawer = await mountDrawer(pinia, task);

    const expected = cardLabel(card);
    expect(expected).toMatch(/^running checks · check$/);
    const summary = drawer.find(".drawer-status-summary");
    expect(summary.find(".drawer-status-l1").text()).toBe(expected);
    expect(summary.findAll(".drawer-status-row")).toHaveLength(2);
    expect(summary.find(".drawer-status-l2").text()).toBe("Running repoos check…");
    expect(summary.find(".drawer-status-l1 .ai").exists()).toBe(true);
    // No duplicate or empty row survives the compacting pass.
    const rows = summary.findAll(".drawer-status-row").map((row) => row.text().trim());
    expect(rows.every(Boolean)).toBe(true);
    expect(new Set(rows).size).toBe(rows.length);
    card.unmount();
    drawer.unmount();
  });

  it("names live engineering work exactly as the card does", async () => {
    const task = activeTask();
    stubApi(task);
    const repo = useRepoStore();
    repo.runningIds = [task.id];

    const card = await mountCard(pinia, task);
    const drawer = await mountDrawer(pinia, task);

    const expected = cardLabel(card);
    expect(expected).toBe("coding");
    const summary = drawer.find(".drawer-status-summary");
    expect(summary.find(".drawer-status-l1").text()).toBe(expected);
    expect(summary.find(".drawer-status-l1 .ai").exists()).toBe(true);
    expect(summary.findAll(".drawer-status-row")).toHaveLength(1);
    card.unmount();
    drawer.unmount();
  });

  it("names a running reviewer exactly as the card does", async () => {
    const task = makeTask({
      status: "review",
      branch: "feat/status-summary",
      git: {
        branchExists: true,
        worktreeExists: true,
        lastCommit: null,
        lastCommitAt: null,
        worktreePath: "/tmp/repo/.worktrees/0001",
        dirty: false,
      },
    });
    stubApi(task, { reviewRunning: true });
    const repo = useRepoStore();
    repo.reviews = {
      [task.id]: { running: true, enabled: true, lines: [], report: null },
    };

    const card = await mountCard(pinia, task);
    const drawer = await mountDrawer(pinia, task);

    const expected = cardLabel(card);
    expect(expected).toBe("Reviewing…");
    const summary = drawer.find(".drawer-status-summary");
    expect(summary.find(".drawer-status-l1").text()).toBe(expected);
    expect(summary.find(".drawer-status-l1 .ai").exists()).toBe(true);
    expect(summary.findAll(".drawer-status-row")).toHaveLength(1);
    card.unmount();
    drawer.unmount();
  });

  it("uses the card label for the integrating pill and status heading", async () => {
    const task = makeTask({
      status: "review",
      branch: "feat/status-summary",
      git: {
        branchExists: true,
        worktreeExists: true,
        lastCommit: null,
        lastCommitAt: null,
        worktreePath: "/tmp/repo/.worktrees/0001",
        dirty: false,
      },
    });
    stubApi(task);
    const repo = useRepoStore();
    repo.integration = pipeline();

    const card = await mountCard(pinia, task);
    const drawer = await mountDrawer(pinia, task);

    const expected = cardLabel(card);
    expect(expected).toContain("integrating · merge");
    const summary = drawer.find(".drawer-status-summary");
    expect(summary.text()).toContain(expected);
    expect(summary.classes()).toContain("is-running");
    const actionText = drawer
      .findAll(".quickbar-row")
      .map((row) => row.text())
      .join("\n");
    expect(actionText).not.toContain("integrating");
    expect(actionText).toContain("Stop MTD");
    expect(actionText).not.toContain("Move to done");
    card.unmount();
    drawer.unmount();
  });

  it("folds close-out progress into a higher-priority card instead of a second line", async () => {
    const task = makeTask({
      status: "review",
      branch: "feat/status-summary",
      git: {
        branchExists: true,
        worktreeExists: true,
        lastCommit: null,
        lastCommitAt: null,
        worktreePath: "/tmp/repo/.worktrees/0001",
        dirty: false,
      },
    });
    const report = {
      id: task.id,
      at: "2026-11-04T08:00:00.000Z",
      agent: "reviewer",
      cli: "opencode",
      model: "default",
      branch: "feat/status-summary",
      state: "incomplete" as const,
      markdown: "",
    };
    stubApi(task, { review: report });
    const repo = useRepoStore();
    repo.integration = pipeline();
    repo.reviews = {
      [task.id]: {
        running: false,
        enabled: true,
        lines: [],
        report,
      },
    };

    const drawer = await mountDrawer(pinia, task);
    const summaries = drawer.findAll(".drawer-status-summary");
    expect(summaries).toHaveLength(1);
    expect(summaries[0].text()).toContain("Review failed");
    expect(summaries[0].text()).toContain("integrating · merge");
    expect(drawer.find(".quickbar-row").text()).not.toContain("integrating");
    drawer.unmount();
  });
});
