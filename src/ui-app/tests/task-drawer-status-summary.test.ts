/**
 * #0952 — the task drawer shows at most one dynamic chip in the header and one
 * status card + one status line between the preview row and the tabs. Canned
 * guidance lives in the info popover; the full text is also in Debug → Status
 * details.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useUiStore } from "../src/stores/ui";
import { useRepoStore } from "../src/stores/repo";
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
    repo.reviews = {
      "0001": {
        running: false,
        enabled: true,
        lines: [],
        report: {
          id: "0001",
          at: new Date().toISOString(),
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
        at: new Date().toISOString(),
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
    expect(summary.find(".drawer-status-summary-copy").text()).toContain("Review failed");
    expect(summary.find(".drawer-status-summary-copy").text()).toContain("No complete report");
  });

  it("places the landable checklist behind the info popover, not in the card", async () => {
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
    const copy = summary.find(".drawer-status-summary-copy");
    expect(copy.text()).toContain("Not landable");
    expect(copy.text()).toContain("1 landing check failing");
    expect(copy.text()).not.toContain("Merge with main");

    // The full checklist is in the popover content (rendered in the DOM because
    // teleport is stubbed in tests).
    const popover = summary.find(".drawer-info-content");
    expect(popover.exists()).toBe(true);
    expect(popover.text()).toContain("Merge with main");
    expect(popover.text()).toContain("src/core/types.ts conflicts with main");
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
    expect(summary.text()).toContain("Checks running");
    expect(summary.text()).toContain("Changed-path (changed:main)");
    expect(summary.text()).not.toContain("Tests 24/72");

    const statusLine = summary.find(".drawer-status-line");
    expect(statusLine.exists()).toBe(true);
    expect(statusLine.text()).toContain("Running checks…");
    expect(statusLine.text()).toContain("on macbook");
    expect(statusLine.text()).toContain("tests 24/72 files");

    // No header chip for a routine running state.
    expect(wrapper.find(".drawer-status-chip").exists()).toBe(false);
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
  });

  it("keeps the file path clamped to two lines via CSS", async () => {
    const pinia = setup();
    const task = makeTask({
      path: "work/0001-very-long-task-title-that-would-wrap-without-clamping.md",
      absPath: "/tmp/repo/work/0001-very-long-task-title-that-would-wrap-without-clamping.md",
    });
    const wrapper = await mountDrawer(pinia, task);
    const pathEl = wrapper.find(".tc-id");
    expect(pathEl.exists()).toBe(true);
    expect(pathEl.classes()).toContain("tc-id");
    // The two-line clamp is declared on the .tc-id class in TaskDrawer.vue.
    // jsdom does not compute -webkit-line-clamp, so we assert the class is
    // present and the long path is rendered.
    expect(pathEl.text()).toContain("0001-very-long-task-title");
  });
});
