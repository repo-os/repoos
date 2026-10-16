/**
 * A store-seeded worktree-handoff conflict opens the modal from the board card
 * (#0810). This is the path the `card:handoffConflict` shot-preview fixture
 * relies on — it needs no drawer and fires no request for the fake task id.
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";

const ButtonStub = defineComponent({
  name: "Button",
  inheritAttrs: false,
  setup(_props, { slots, attrs }) {
    return () => h("button", attrs, slots.default?.() as never);
  },
});

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0042",
  title: "Test task",
  type: "feature",
  status: "review",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  // No branch: the card then skips the diff-stats request for its id.
  branch: "",
  tags: [],
  needsInput: false,
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/0042-test.md",
  absPath: "/tmp/repo/work/0042-test.md",
  body: "",
  extra: {},
  agentOverride: null,
  cliOverride: null,
  modelOverride: null,
  git: {
    branchExists: false,
    worktreeExists: false,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
  preview: null,
  ...over,
});

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

function mountCard(task: Task) {
  const pinia = createPinia();
  setActivePinia(pinia);
  return {
    pinia,
    wrapper: mount(TaskCard, {
      props: { task, dragEnabled: false },
      global: { plugins: [pinia], stubs: { teleport: true, Button: ButtonStub } },
    }),
  };
}

describe("TaskCard worktree-handoff conflict modal (#0810)", () => {
  it("opens the file-list modal from a store-seeded conflict", async () => {
    const task = makeTask();
    const { wrapper } = mountCard(task);
    const repo = useRepoStore();
    repo.seedWorktreeHandoffConflict("0042", {
      message: "worktree changed after handoff: HEAD is 1a2b3c4d but handoff recorded 5e6f7a8b.",
      files: [
        { path: "src/a.ts", added: 3, removed: 1, taskFile: false },
        { path: "work/0042-x.md", added: 1, removed: 0, taskFile: true },
      ],
    });
    await flush();

    expect(wrapper.find("#handoff-conflict-title").exists()).toBe(true);
    const rows = wrapper.findAll(".dirty-list .dirty-file");
    expect(rows).toHaveLength(2);
    // Counts render, and the task file is grouped after the source change.
    expect(rows[0]!.text()).toContain("+3");
    expect(rows[0]!.text()).toContain("-1");
    expect(wrapper.find(".dirty-file-group").text()).toContain("task files");
    expect(wrapper.find(".dirty-actions").findAll("button")).toHaveLength(3);
  });

  it("does not open its own modal while the task's drawer is active", async () => {
    const task = makeTask();
    const { wrapper } = mountCard(task);
    const repo = useRepoStore();
    const ui = useUiStore();
    ui.active = task;
    repo.seedWorktreeHandoffConflict("0042", {
      message: "worktree changed after handoff",
      files: [{ path: "src/a.ts", added: 1, removed: 0, taskFile: false }],
    });
    await flush();

    // The drawer renders its own copy; the card must not stack a second one.
    expect(wrapper.find("#handoff-conflict-title").exists()).toBe(false);
  });
});
