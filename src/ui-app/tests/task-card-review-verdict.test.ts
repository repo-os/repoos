/**
 * TaskCard's "review passed · ready to finish" hint (and the pulsing
 * review-ready glow) used to fire purely because nothing was actively
 * running — including after a "needs some work" or "back to the drawing
 * board" verdict, e.g. once auto-bounce hit its round cap. Both now check
 * the actual verdict via reviewVerdict.ts.
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import TaskCard from "../src/components/TaskCard.vue";
import { useRepoStore } from "../src/stores/repo";
import type { IntegrationPipelineSnapshot, Task } from "../src/types";

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0001",
  title: "Test task",
  type: "feature",
  status: "review",
  priority: "p2",
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
  path: "work/0001-test.md",
  absPath: "/tmp/repo/work/0001-test.md",
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
    worktreePath: "/tmp/repo-wt",
    dirty: false,
  },
  preview: null,
  ...over,
});

function report(markdown: string) {
  return {
    id: "0001",
    at: new Date().toISOString(),
    agent: "reviewer",
    cli: "opencode",
    model: "default",
    branch: "feat/x",
    state: "ok" as const,
    markdown,
  };
}

function mountCard(task: Task) {
  return mount(TaskCard, { props: { task, dragEnabled: false } });
}

describe("TaskCard review-passed hint reflects the actual verdict", () => {
  it("offers evidence refresh and the CLI command for a stale-only review finding", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.reviews = {
      "0001": {
        running: false,
        enabled: true,
        lines: [],
        report: report("## Verdict\nneeds some work. STALE-EVIDENCE-ONLY"),
      },
    };
    const wrapper = mountCard(makeTask());
    expect(wrapper.get('[data-test-id="task-card-refresh-evidence"]').text()).toContain(
      "Refresh evidence",
    );
    expect(wrapper.text()).toContain("Stale evidence");
    expect(wrapper.text()).not.toContain("repoos verify");
  });

  describe("stale-evidence prompt during close-out (#1277)", () => {
    const stalePinia = (integration: IntegrationPipelineSnapshot | null) => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const repo = useRepoStore();
      repo.reviews = {
        "0001": {
          running: false,
          enabled: true,
          lines: [],
          report: report("## Verdict\nneeds some work. STALE-EVIDENCE-ONLY"),
        },
      };
      repo.integration = integration;
      return pinia;
    };
    const pipeline = (
      active: IntegrationPipelineSnapshot["active"],
      queue: string[] = [],
    ): IntegrationPipelineSnapshot => ({
      empty: false,
      queue,
      at: "2026-11-22T12:00:00.000Z",
      active,
    });
    const job = (over: Partial<NonNullable<IntegrationPipelineSnapshot["active"]>>) => ({
      taskId: "0001",
      stage: null,
      failed: false,
      startedAt: "2026-11-22T12:00:00.000Z",
      lastProgressAt: "2026-11-22T12:00:00.000Z",
      ...over,
    });

    it("hides the notice and Refresh evidence while queued behind another close-out", () => {
      const pinia = stalePinia(pipeline(job({ taskId: "0002" }), ["0001"]));
      const wrapper = mount(TaskCard, {
        props: { task: makeTask(), dragEnabled: false },
        global: { plugins: [pinia] },
      });
      expect(wrapper.find('[data-test-id="task-card-refresh-evidence"]').exists()).toBe(false);
      expect(wrapper.text()).not.toContain("Stale evidence");
    });

    it.each(["syncing", "validating", "publishing", "cleanup"])(
      "hides the notice and Refresh evidence while the job is in %s",
      (phase) => {
        const pinia = stalePinia(pipeline(job({ phase })));
        const wrapper = mount(TaskCard, {
          props: { task: makeTask(), dragEnabled: false },
          global: { plugins: [pinia] },
        });
        expect(wrapper.find('[data-test-id="task-card-refresh-evidence"]').exists()).toBe(false);
        expect(wrapper.text()).not.toContain("Stale evidence");
      },
    );

    it("shows the notice and Refresh evidence again after the job fails", () => {
      const pinia = stalePinia(pipeline(job({ phase: "validating", failed: true })));
      const wrapper = mount(TaskCard, {
        props: { task: makeTask(), dragEnabled: false },
        global: { plugins: [pinia] },
      });
      expect(wrapper.get('[data-test-id="task-card-refresh-evidence"]').text()).toContain(
        "Refresh evidence",
      );
      expect(wrapper.text()).toContain("Stale evidence");
    });

    it("shows the notice when no close-out involves the task", () => {
      const pinia = stalePinia(pipeline(job({ taskId: "0002", phase: "validating" })));
      const wrapper = mount(TaskCard, {
        props: { task: makeTask(), dragEnabled: false },
        global: { plugins: [pinia] },
      });
      expect(wrapper.find('[data-test-id="task-card-refresh-evidence"]').exists()).toBe(true);
    });
  });

  it("shows the green ready hint and glow when the verdict is 'good to go'", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask();
    repo.reviews = {
      "0001": {
        running: false,
        enabled: true,
        lines: [],
        report: report("## Verdict\ngood to go."),
      },
    };
    repo.seedLandable("0001", {
      taskId: "0001",
      branch: "feat/x",
      headSha: "abc",
      lockSha: "abc",
      landable: true,
      checks: [],
      summary: { pass: 6, warn: 0, fail: 0 },
    });

    const wrapper = mountCard(task);

    const hint = wrapper.find(".tc-hint");
    expect(hint.classes()).toContain("tc-human");
    expect(hint.text()).toContain("ready to finish");
    expect(wrapper.find(".task-card").classes()).toContain("review-ready");
  });

  it("shows an amber warning instead, and drops the glow, for 'needs some work'", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask();
    repo.reviews = {
      "0001": {
        running: false,
        enabled: true,
        lines: [],
        report: report("## Verdict\nneeds some work — a few real defects."),
      },
    };

    const wrapper = mountCard(task);

    const hint = wrapper.find(".tc-hint");
    expect(hint.classes()).toContain("tc-review-warn");
    expect(hint.text()).toContain("needs some work");
    expect(hint.text()).not.toContain("ready to finish");
    expect(wrapper.find(".task-card").classes()).not.toContain("review-ready");
  });

  it("labels a previous-round verdict as awaiting review and withholds Move to done", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({
      body: "## Activity\n\n- 2026-09-27T23:08:22Z · status active→review\n- 2026-09-27T23:20:31Z · status review→active\n- 2026-09-27T23:36:46Z · status active→review\n",
    });
    repo.reviews = {
      "0001": {
        running: false,
        enabled: true,
        lines: [],
        report: { ...report("## Verdict\nneeds some work."), at: "2026-09-27T23:18:30Z" },
      },
    };

    const wrapper = mountCard(task);
    expect(wrapper.find(".tc-hint").text()).toContain("awaiting fresh review");
    expect(wrapper.text()).not.toContain("Move to done");
  });

  it("shows a red rejection, and drops the glow, for 'back to the drawing board'", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask();
    repo.reviews = {
      "0001": {
        running: false,
        enabled: true,
        lines: [],
        report: report("## Verdict\nback to the drawing board."),
      },
    };

    const wrapper = mountCard(task);

    const hint = wrapper.find(".tc-hint");
    expect(hint.classes()).toContain("tc-review-bad");
    expect(hint.text()).toContain("back to the drawing board");
    expect(wrapper.find(".task-card").classes()).not.toContain("review-ready");
  });

  it("shows no working hint when no report exists yet and nothing is running", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask();
    repo.reviews = {};

    const wrapper = mountCard(task);

    expect(wrapper.find(".tc-hint").exists()).toBe(false);
    expect(wrapper.find(".task-card").classes()).not.toContain("review-ready");
  });

  it("shows incomplete state without the ready-to-finish glow", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask();
    repo.reviews = {
      "0001": {
        running: false,
        enabled: true,
        lines: [],
        report: {
          ...report("## Bugs\nThinking aloud but never stated a verdict."),
          state: "incomplete",
        },
      },
    };

    const wrapper = mountCard(task);

    const hint = wrapper.find(".tc-hint");
    expect(hint.text()).toContain("review incomplete");
    expect(hint.text()).not.toContain("ready to finish");
    expect(wrapper.find(".task-card").classes()).not.toContain("review-ready");
  });
});
