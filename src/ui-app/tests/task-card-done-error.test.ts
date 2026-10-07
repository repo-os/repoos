/**
 * Board card move-to-done error footer (#0741): flush square panel, stale
 * disclosure while close-out retries, Fix disabled in flight.
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import DoneErrorCard from "../src/components/DoneErrorCard.vue";
import { useRepoStore } from "../src/stores/repo";
import type { IntegrationPipelineSnapshot, Task } from "../src/types";

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
  branch: "feat/x",
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
    branchExists: true,
    worktreeExists: true,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
  preview: null,
  ...over,
});

function pipeline(taskId: string, startedAt: string): IntegrationPipelineSnapshot {
  return {
    empty: false,
    active: { taskId, stage: "check", failed: false, startedAt },
    queue: [],
    at: startedAt,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

function seedDoneError(repo: ReturnType<typeof useRepoStore>): void {
  repo.doneErrors = {
    "0042": {
      message: "Leftover debug broke 43 tests — see log",
      conflicts: [],
      step: "check",
      failedAt: "2026-09-20T10:00:00.000Z",
      tldr: "Check gate failed on 43 tests",
    },
  };
}

describe("TaskCard done-error footer (#0741)", () => {
  it("nests the error panel flush under the action button in the card footer", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    seedDoneError(repo);
    repo.integration = pipeline("0042", "2026-09-20T12:00:00.000Z");

    const wrapper = mount(TaskCard, {
      props: { task: makeTask(), dragEnabled: false },
      global: { plugins: [pinia], stubs: { RestartTaskDialog: true, ActivityIndicator: true } },
    });
    await flush();

    const footer = wrapper.find(".tc-card-footer");
    expect(footer.exists()).toBe(true);
    expect(footer.find(".tc-card-footer-action").exists()).toBe(true);
    expect(footer.text()).toContain("Moving to done");
    const err = footer.find(".tc-done-error.done-error--card");
    expect(err.exists()).toBe(true);
    expect(err.element.parentElement).toBe(footer.element);
    expect(footer.element.children.length).toBe(2);
    expect(
      [...footer.element.children].map((el) => el.className.split(/\s+/).slice(0, 2).join(" ")),
    ).toMatchInlineSnapshot(`
      [
        "tc-card-footer-action flex",
        "done-error done-error--card",
      ]
    `);
  });

  it("collapses a stale error behind Previous attempt failed while close-out runs", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    seedDoneError(repo);
    repo.integration = pipeline("0042", "2026-09-20T12:00:00.000Z");

    const wrapper = mount(TaskCard, {
      props: { task: makeTask(), dragEnabled: false },
      global: { plugins: [pinia], stubs: { RestartTaskDialog: true, ActivityIndicator: true } },
    });
    await flush();

    const details = wrapper.find("details.done-error-stale");
    expect(details.exists()).toBe(true);
    expect((details.element as HTMLDetailsElement).open).toBe(false);
    expect(wrapper.text()).toContain("Previous attempt failed:");
    expect(wrapper.text()).toContain("Check gate failed on 43 tests");
  });

  it("shows the full error line when the failure is fresh (not before the attempt)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.doneErrors = {
      "0042": {
        message: "merge conflict: src/a.ts",
        conflicts: ["src/a.ts"],
        step: "merge",
        failedAt: "2026-09-20T12:05:00.000Z",
      },
    };
    repo.integration = pipeline("0042", "2026-09-20T12:00:00.000Z");

    const wrapper = mount(TaskCard, {
      props: { task: makeTask(), dragEnabled: false },
      global: { plugins: [pinia], stubs: { RestartTaskDialog: true, ActivityIndicator: true } },
    });
    await flush();

    expect(wrapper.find("details.done-error-stale").exists()).toBe(false);
    expect(wrapper.find(".done-error-row .done-error-msg").text()).toContain("merge conflict");
  });

  it("disables Fix with a tooltip while close-out is in flight", async () => {
    const wrapper = mount(DoneErrorCard, {
      props: {
        message: "boom",
        taskId: "0042",
        fixDisabled: true,
        fixDisabledTitle: "Close-out is running — wait for it to finish before sending to Debugger",
      },
    });
    await flush();
    const fix = wrapper.find("button.done-error-fix");
    expect(fix.attributes("disabled")).toBeDefined();
    expect(fix.attributes("title")).toContain("Close-out is running");
  });
});
