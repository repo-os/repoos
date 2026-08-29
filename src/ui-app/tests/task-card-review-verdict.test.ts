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
import type { Task } from "../src/types";

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

  it("falls back to the optimistic hint when no report exists yet (can't know better)", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask();
    repo.reviews = {};

    const wrapper = mountCard(task);

    const hint = wrapper.find(".tc-hint");
    expect(hint.classes()).toContain("tc-human");
    expect(wrapper.find(".task-card").classes()).toContain("review-ready");
  });
});
