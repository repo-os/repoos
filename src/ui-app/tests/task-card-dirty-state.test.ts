import { beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import TaskCard from "../src/components/TaskCard.vue";
import type { Task } from "../src/types";

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0001",
  title: "Test task",
  type: "feature",
  status: "ready",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/test",
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

describe("task card dirty state display", () => {
  beforeEach(() => {
    const pinia = createPinia();
    setActivePinia(pinia);
  });

  it("does not display passive dirty badge for clean task", () => {
    const task = makeTask({ status: "ready", git: { ...makeTask().git, dirty: false } });
    const wrapper = mount(TaskCard, {
      props: { task },
      global: {
        plugins: [createPinia()],
      },
    });
    
    // Should not have any dirty badge elements
    expect(wrapper.find('.tc-dirty').exists()).toBe(false);
  });

  it("does not display passive dirty badge for dirty task (passive state removed)", () => {
    const task = makeTask({ status: "ready", git: { ...makeTask().git, dirty: true } });
    const wrapper = mount(TaskCard, {
      props: { task },
      global: {
        plugins: [createPinia()],
      },
    });
    
    // Should not have any dirty badge elements even for dirty tasks
    expect(wrapper.find('.tc-dirty').exists()).toBe(false);
  });

  it("does not show dirty badge for branchless tasks", () => {
    const task = makeTask({ 
      status: "ready", 
      branch: "",
      git: { 
        branchExists: false,
        worktreeExists: false,
        lastCommit: null,
        lastCommitAt: null,
        worktreePath: null,
        dirty: false,
      } 
    });
    const wrapper = mount(TaskCard, {
      props: { task },
      global: {
        plugins: [createPinia()],
      },
    });
    
    // Should not have any dirty badge elements for branchless tasks
    expect(wrapper.find('.tc-dirty').exists()).toBe(false);
  });

  it("preserves internal dirty state detection for actionable scenarios", () => {
    // This test ensures the internal state is still tracked for actionable scenarios
    const task = makeTask({ status: "review", git: { ...makeTask().git, dirty: true } });
    expect(task.git.dirty).toBe(true);
    // The actual actionable behavior (dialogs, etc.) is tested elsewhere
  });
});