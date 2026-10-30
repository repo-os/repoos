/**
 * #0952 — the task drawer shows at most one dynamic chip in the header and one
 * status card between the preview row and the tabs. The card is three lines
 * and opens Debug → Status details.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useUiStore } from "../src/stores/ui";
import { useRepoStore } from "../src/stores/repo";
import { useNoticesStore } from "../src/stores/notices";
import type { Task } from "../src/types";
import { EMPTY_COUNTS, FakeEventSource, flush, json, makeTask } from "./component-test-helpers";

const reviewTask = (over: Partial<Task> = {}): Task =>
  makeTask({
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
    ...over,
  });

async function mountDrawer(
  pinia: Pinia,
  task: Task,
  opts: { reviewReport?: Record<string, unknown> | null } = {},
) {
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index")) {
        const counts =
          task.status === "review"
            ? { ...EMPTY_COUNTS, review: 1 }
            : { ...EMPTY_COUNTS, active: 1 };
        return json({ tasks: [task], counts, taskCount: 1 });
      }
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/review"))
        return json({
          ok: true,
          running: false,
          enabled: true,
          review: opts.reviewReport ?? null,
          lines: [],
        });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      return json({ ok: true });
    }),
  );
  const ui = useUiStore();
  ui.open(task);
  const wrapper = mount(TaskDrawer, {
    global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
  });
  await flush();
  return wrapper;
}

function setup(): Pinia {
  const pinia = createPinia();
  setActivePinia(pinia);
  return pinia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("task drawer status summary (#0952)", () => {
  it("shows one short header chip and keeps it out of the status card region", async () => {
    const pinia = setup();
    // Active task flagged for human input: the header chip is short and the
    // waiting card sits below the preview row.
    const task = makeTask({
      status: "active",
      needsInput: true,
      needsInputReason: "dev-error",
    });
    const wrapper = await mountDrawer(pinia, task);

    const chips = wrapper.findAll(".drawer-head .rs-chip");
    expect(chips.length).toBe(1);
    expect(chips[0].text()).toBe("Agent failed");

    // The waiting card is the one status card in the region below the tabs.
    const cards = wrapper.findAll(".drawer-critical");
    expect(cards.length).toBe(1);
    expect(cards[0].find(".agent-waiting-title").text()).toContain("waiting for you");
  });

  it("suppresses the header chip when the status already says review, and shows the review-failed card", async () => {
    const pinia = setup();
    const repo = useRepoStore();
    const task = reviewTask({ needsInput: false });
    const reportAt = "2026-10-31T01:00:00.000Z";
    repo.reviews = {
      "0001": {
        running: false,
        enabled: true,
        lines: [],
        report: {
          id: "0001",
          at: reportAt,
          agent: "reviewer",
          cli: "opencode",
          model: "default",
          branch: "feat/status-summary",
          state: "incomplete",
          markdown: "",
        },
      },
    };
    const wrapper = await mountDrawer(pinia, task, {
      reviewReport: {
        id: "0001",
        at: reportAt,
        agent: "reviewer",
        cli: "opencode",
        model: "default",
        branch: "feat/status-summary",
        state: "incomplete",
        markdown: "",
      },
    });

    // The lifecycle status "review" already covers it; no extra chip.
    expect(wrapper.find(".drawer-head .rs-chip").exists()).toBe(false);

    const summary = wrapper.find(".drawer-status-summary");
    expect(summary.exists()).toBe(true);
    expect(summary.find(".drawer-status-l1").text()).toContain("Review failed");
    expect(summary.find(".drawer-status-l3").text()).toContain("No complete report");
    expect(summary.findAll(".drawer-status-row")).toHaveLength(3);

    await wrapper
      .findAll("button.tab-btn")
      .find((tab) => tab.text().includes("Debug"))!
      .trigger("click");
    await wrapper
      .findAll("button.debug-tab")
      .find((tab) => tab.text().includes("Status details"))!
      .trigger("click");
    await flush();
    const times = wrapper.findAll(".debug-status-time");
    expect(times.length).toBeGreaterThanOrEqual(2);
    expect(times.every((time) => time.attributes("datetime") === reportAt)).toBe(true);
    expect(times[0].attributes("data-tip")).toBe(new Date(reportAt).toLocaleString());
    expect(times[0].attributes("title")).toBeUndefined();
  });

  it("keeps the landable checklist off the card and opens Status details", async () => {
    const pinia = setup();
    const repo = useRepoStore();
    repo.seedLandable("0001", {
      taskId: "0001",
      branch: "feat/status-summary",
      headSha: "a".repeat(40),
      lockSha: "a".repeat(40),
      landable: false,
      checks: [
        {
          id: "merge-conflicts",
          label: "Merge with main",
          status: "fail",
          detail: "src/core/types.ts conflicts with main",
          nextStep: "Merge main into the branch",
        },
      ],
      summary: { pass: 0, warn: 0, fail: 1 },
    });
    const wrapper = await mountDrawer(pinia, reviewTask());

    const summary = wrapper.find(".drawer-status-summary");
    expect(summary.find(".drawer-status-l1").text()).toContain("Not landable");
    expect(summary.find(".drawer-status-l3").text()).toContain("1 landing check failing");
    expect(summary.text()).not.toContain("Merge with main");
    expect(summary.find(".drawer-info-popover").exists()).toBe(false);
    expect(summary.findAll(".drawer-status-row")).toHaveLength(3);

    await summary.trigger("keydown", { key: "Enter" });
    await flush();
    expect(useUiStore().activeTab).toBe("debug");
    expect(useUiStore().debugView).toBe("status");
  });

  it("shows one status line for running checks and no long detail in the card", async () => {
    const pinia = setup();
    const repo = useRepoStore();
    const task = makeTask({
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
    });
    const startedAt = new Date(Date.now() - 70_000).toISOString();
    repo.taskChecks["0001"] = [
      {
        id: "0001-merge-gate-1",
        taskId: "0001",
        kind: "merge-gate",
        startedAt,
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
      },
    ];
    const wrapper = await mountDrawer(pinia, task);

    const summary = wrapper.find(".drawer-status-summary");
    expect(summary.find(".drawer-status-l1").text()).toContain("Checks running");
    expect(summary.find(".drawer-status-l2").text()).toContain("Changed-path vs main");
    expect(summary.find(".drawer-status-l2").text()).toContain("on macbook");
    expect(summary.find(".drawer-status-l3").text()).toContain("Step 4 of 8 · tests 24/72 files");
    expect(summary.findAll(".drawer-status-row")).toHaveLength(3);
    expect(summary.find(".drawer-info-popover").exists()).toBe(false);

    await summary.trigger("click");
    await flush();
    expect(useUiStore().activeTab).toBe("debug");
    expect(useUiStore().debugView).toBe("status");
    // No header chip for a routine running state.
    expect(wrapper.find(".drawer-status-chip").exists()).toBe(false);
  });

  it("uses Starting… and three lines before a step number exists", async () => {
    const pinia = setup();
    const repo = useRepoStore();
    const task = makeTask({ status: "active", branch: "feat/status-summary" });
    repo.taskChecks["0001"] = [
      {
        id: "0001-merge-gate-1",
        taskId: "0001",
        kind: "merge-gate",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        durationMs: null,
        running: true,
        passed: null,
        code: null,
        output: "",
        scope: "full",
        machine: "thinkpad",
      },
    ];
    const wrapper = await mountDrawer(pinia, task);
    const summary = wrapper.find(".drawer-status-summary");
    expect(summary.findAll(".drawer-status-row")).toHaveLength(3);
    expect(summary.find(".drawer-status-l2").text()).toContain("Full check");
    expect(summary.find(".drawer-status-l2").text()).toContain("on thinkpad");
    expect(summary.find(".drawer-status-l3").text()).toBe("Starting…");
    expect(summary.text()).not.toContain("step —");
  });

  it("renders three lines for a failed check and opens Status details", async () => {
    const pinia = setup();
    const repo = useRepoStore();
    const task = makeTask({
      status: "active",
      branch: "feat/status-summary",
      checkRetryCount: 2,
    });
    repo.taskChecks["0001"] = [
      {
        id: "0001-merge-gate-1",
        taskId: "0001",
        kind: "merge-gate",
        startedAt: new Date(Date.now() - 20_000).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 20_000,
        running: false,
        passed: false,
        code: 1,
        output: "tests failed after retries",
        scope: "changed:9f3f0ca",
        machine: "thinkpad",
      },
    ];
    const wrapper = await mountDrawer(pinia, task);
    const summary = wrapper.find(".drawer-status-summary");
    expect(summary.findAll(".drawer-status-row")).toHaveLength(3);
    expect(summary.find(".drawer-status-l1").text()).toContain("Checks failed");
    expect(summary.find(".drawer-status-l2").text()).toContain("Changed-path vs 9f3f0ca");
    expect(summary.find(".drawer-status-l2").text()).toContain("on thinkpad");
    expect(summary.find(".drawer-status-l3").text()).toContain("tests failed after retries");
    await summary.trigger("keydown", { key: " " });
    await flush();
    expect(useUiStore().activeTab).toBe("debug");
    expect(useUiStore().debugView).toBe("status");
  });

  it("shows a red Slow chip with the elapsed time when the running check is over-long", async () => {
    const pinia = setup();
    const repo = useRepoStore();
    const notices = useNoticesStore();
    const task = makeTask({
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
    });
    repo.taskChecks["0001"] = [
      {
        id: "0001-merge-gate-1",
        taskId: "0001",
        kind: "merge-gate",
        startedAt: new Date(Date.now() - 70_000).toISOString(),
        finishedAt: null,
        durationMs: null,
        running: true,
        passed: null,
        code: null,
        output: "",
        scope: "full",
        machine: "macbook",
      },
    ];
    notices.slowRunItems = [
      {
        id: "slow:0001",
        taskId: "0001",
        message: "Slow check",
        detail: "1m 10s elapsed, typical 30s",
      },
    ];
    const wrapper = await mountDrawer(pinia, task);
    const chip = wrapper.find(".drawer-status-chip");
    expect(chip.exists()).toBe(true);
    expect(chip.classes()).toContain("ck-chip-slow");
    expect(chip.text()).toContain("Slow");
    expect(chip.text()).toMatch(/\d+m \d+s/);
    expect(chip.text()).not.toContain("Checks running");
    expect(chip.attributes("title")).toBeUndefined();
    expect(wrapper.findAll(".drawer-status-chip")).toHaveLength(1);
  });

  it("lists the full landable checklist in Debug → Status details", async () => {
    const pinia = setup();
    const repo = useRepoStore();
    repo.seedLandable("0001", {
      taskId: "0001",
      branch: "feat/status-summary",
      headSha: "a".repeat(40),
      lockSha: "a".repeat(40),
      landable: false,
      checks: [
        {
          id: "merge-conflicts",
          label: "Merge with main",
          status: "fail",
          detail: "src/core/types.ts conflicts with main",
          nextStep: "Merge main into the branch",
        },
      ],
      summary: { pass: 0, warn: 0, fail: 1 },
    });
    const wrapper = await mountDrawer(pinia, reviewTask());

    await wrapper
      .findAll("button.tab-btn")
      .find((tab) => tab.text().includes("Debug"))!
      .trigger("click");
    await wrapper
      .findAll("button.debug-tab")
      .find((tab) => tab.text().includes("Status details"))!
      .trigger("click");
    await flush();

    const statusDetails = wrapper.find('[aria-label="Task status details"]');
    expect(statusDetails.exists()).toBe(true);
    expect(statusDetails.text()).toContain("Not landable");
    expect(statusDetails.text()).toContain("Merge with main");
    expect(statusDetails.text()).toContain("src/core/types.ts conflicts with main");
    const landableTime = statusDetails
      .findAll(".debug-status-detail")
      .find((row) => row.text().includes("Not landable"))!
      .find(".debug-status-time");
    expect(landableTime.exists()).toBe(true);
    expect(landableTime.attributes("datetime")).toBe(repo.landableFetchedAtFor("0001"));
  });

  it("shows a one-line filename without the work prefix and exposes the full path", async () => {
    const pinia = setup();
    const task = makeTask({
      path: "work/0001-very-long-task-title-that-would-wrap-without-clamping.md",
      absPath: "/tmp/repo/work/0001-very-long-task-title-that-would-wrap-without-clamping.md",
    });
    const wrapper = await mountDrawer(pinia, task);
    const pathEl = wrapper.find(".drawer-task-filename");
    expect(pathEl.exists()).toBe(true);
    expect(pathEl.classes()).toContain("tc-id");
    expect(pathEl.text()).not.toContain("work/");
    expect(pathEl.attributes("data-tip")).toBe(task.path);
    expect(pathEl.attributes("tabindex")).toBe("0");
    expect(pathEl.attributes("title")).toBeUndefined();
    expect(pathEl.classes()).toContain("drawer-task-filename");
    expect(pathEl.text()).toContain("0001-very-long-task-title");
  });
});
