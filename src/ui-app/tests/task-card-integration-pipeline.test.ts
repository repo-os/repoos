/**
 * #0740 — board card close-out pipeline hints match the integration snapshot.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import { useRepoStore } from "../src/stores/repo";
import type { IntegrationPipelineSnapshot, Task } from "../src/types";

const task = (id: string): Task =>
  ({
    id,
    title: `Task ${id}`,
    type: "feature",
    status: "review",
    priority: "p2",
    area: "web",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: `feat/${id}`,
    tags: [],
    needsInput: false,
    needsMerge: false,
    created_at: null,
    updated_at: null,
    path: `work/${id}.md`,
    absPath: `/tmp/${id}.md`,
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
    automaticReview: { running: false, enabled: true },
  }) as Task;

function pipeline(over: Partial<IntegrationPipelineSnapshot> = {}): IntegrationPipelineSnapshot {
  return {
    empty: false,
    active: {
      taskId: "0730",
      stage: null,
      failed: false,
      startedAt: "2026-10-07T13:00:00.000Z",
      lastProgressAt: "2026-10-07T13:00:00.000Z",
    },
    queue: ["0720"],
    at: "2026-10-07T13:00:00.000Z",
    ...over,
  };
}

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  vi.useFakeTimers({ now: new Date("2026-10-07T13:02:27.000Z") });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TaskCard integration pipeline (#0740)", () => {
  it("shows integrating · starting… for the active job before the first stage", async () => {
    const repo = useRepoStore();
    repo.integration = pipeline();
    const wrapper = mount(TaskCard, {
      props: { task: task("0730"), dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await nextTick();
    const hint = wrapper.get('[data-test-id="task-card-agent-hint"]');
    expect(hint.text()).toContain("integrating · starting…");
    expect(hint.text()).not.toContain("queued for close-out");
  });

  it("shows queue position for a task waiting behind the active job", async () => {
    const repo = useRepoStore();
    repo.integration = pipeline();
    const wrapper = mount(TaskCard, {
      props: { task: task("0720"), dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await nextTick();
    const hint = wrapper.get('[data-test-id="task-card-agent-hint"]');
    expect(hint.text()).toContain("queued #1 (behind #0730)");
  });

  it("offers cancel and retry when the active job is stalled", async () => {
    vi.setSystemTime(new Date("2026-10-07T13:04:30.000Z"));
    const repo = useRepoStore();
    repo.integration = pipeline();
    const wrapper = mount(TaskCard, {
      props: { task: task("0730"), dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await nextTick();
    const hint = wrapper.get('[data-test-id="task-card-agent-hint"]');
    expect(hint.text()).toMatch(/stalled · no progress/);
    expect(wrapper.find(".tc-pipeline-recover-btn").exists()).toBe(true);
    expect(wrapper.text()).toContain("Retry");
  });
});
