/**
 * #0511 — card and drawer name the `needs_input` reason; idle review tasks
 * must not show a working indicator while needs-input uses a static warning.
 */
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";
import { NEEDS_INPUT_STATUS_LABELS } from "../src/lib/needs-input-ui";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0506",
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
  path: "work/0506-test.md",
  absPath: "/tmp/repo/work/0506-test.md",
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
});

function mountCard(task: Task) {
  return mount(TaskCard, { props: { task, dragEnabled: false } });
}

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Array<(ev: { data: string }) => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(t: string, fn: (ev: { data: string }) => void): void {
    const list = this.listeners.get(t) ?? [];
    list.push(fn);
    this.listeners.set(t, list);
  }
  close(): void {
    /* noop */
  }
}

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

async function mountDrawer(pinia: Pinia, task: Task) {
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  const ui = useUiStore();
  ui.open(task);
  const wrapper = mount(TaskDrawer, {
    global: {
      plugins: [pinia, router],
      stubs: { teleport: true, Transition: true },
    },
  });
  await flush();
  return wrapper;
}

function stubDrawerApi(
  task: Task,
  opts: { reviewRunning?: boolean; agentRunning?: boolean } = {},
): void {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) {
        return json({
          tasks: opts.agentRunning ? [{ id: task.id, agent: "engineer" }] : [],
        });
      }
      if (url.includes("/review"))
        return json({
          ok: true,
          running: opts.reviewRunning ?? false,
          enabled: true,
          review: null,
          lines: [],
        });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

describe("needs_input status labels on the board card (#0511)", () => {
  for (const [reason, label] of Object.entries(NEEDS_INPUT_STATUS_LABELS)) {
    it(`shows "${label}" for ${reason}`, () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const repo = useRepoStore();
      repo.reviews = {};
      const task = makeTask({
        status: "active",
        needsInput: true,
        needsInputReason: reason === "questions" ? undefined : reason,
        questions: reason === "questions" ? ["Which API?"] : undefined,
      });
      const wrapper = mountCard(task);
      const hint = wrapper.find(".tc-hint");
      expect(hint.classes()).toContain("tc-needs-input");
      expect(hint.find(".tc-needs-input-icon").exists()).toBe(true);
      expect(hint.find(".ai").exists()).toBe(false);
      expect(hint.text()).toContain(label);
      expect(wrapper.find(".tc-waiting").exists()).toBe(false);
    });
  }

  it("falls back to Needs your input for an unknown reason", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.reviews = {};
    const task = makeTask({
      status: "active",
      needsInput: true,
      needsInputReason: "totally-unknown-reason",
    });
    const wrapper = mountCard(task);
    expect(wrapper.find(".tc-hint").text()).toContain("Needs your input");
  });

  it("shows review passed when dev-error needs_input is stale on a review task", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({
      needsInput: true,
      needsInputReason: "dev-error",
    });
    repo.reviews = {
      "0506": {
        running: false,
        enabled: true,
        lines: [],
        report: {
          id: "0506",
          at: new Date().toISOString(),
          agent: "reviewer",
          cli: "opencode",
          model: "default",
          branch: "feat/x",
          state: "ok",
          markdown: "## Verdict\ngood to go.",
        },
      },
    };
    const wrapper = mountCard(task);
    const hint = wrapper.find(".tc-hint");
    expect(hint.text()).toContain("ready to finish");
    expect(wrapper.find(".task-card").classes()).not.toContain("needs-input");
  });

  it("shows no working hint for review with needs_input and no running review", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({
      needsInput: true,
      needsInputReason: "review-failed",
    });
    repo.reviews = {
      "0506": { running: false, enabled: true, lines: [], report: null },
    };
    const wrapper = mountCard(task);
    const hint = wrapper.find(".tc-hint");
    expect(hint.classes()).toContain("tc-needs-input");
    expect(hint.find(".ai").exists()).toBe(false);
    expect(hint.text()).toContain("Reviewer failed");
  });
});

describe("needs_input status labels in the task drawer (#0511)", () => {
  for (const [reason, label] of Object.entries(NEEDS_INPUT_STATUS_LABELS)) {
    it(`header chip shows "${label}" for ${reason}`, async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      FakeEventSource.instances = [];
      const task = makeTask({
        status: reason === "review-failed" ? "review" : "active",
        needsInput: true,
        needsInputReason: reason === "questions" ? undefined : reason,
        questions: reason === "questions" ? ["Pick A or B"] : undefined,
      });
      stubDrawerApi(task);
      const wrapper = await mountDrawer(pinia, task);
      const chip = wrapper.find(".rs-chip.rs-needs-input");
      expect(chip.exists()).toBe(true);
      expect(chip.text()).toContain(label);
      expect(wrapper.find(".rs-reviewing").exists()).toBe(false);
    });
  }

  it("shows no review substate chip when review is idle with no verdict and no needs_input", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask({ needsInput: false });
    stubDrawerApi(task);
    const wrapper = await mountDrawer(pinia, task);
    expect(wrapper.find(".rs-chip").exists()).toBe(false);
  });

  it("shows reviewing, not a stale needs-input chip, while a review is running", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask({
      needsInput: true,
      needsInputReason: "watchdog-stuck",
    });
    stubDrawerApi(task, { reviewRunning: true });
    const repo = useRepoStore();
    repo.reviews = {
      "0506": { running: true, enabled: true, lines: [], report: null },
    };
    const wrapper = await mountDrawer(pinia, task);
    const chip = wrapper.find(".rs-chip");
    expect(chip.classes()).toContain("rs-reviewing");
    expect(chip.text()).toContain("reviewing");
    expect(wrapper.find(".rs-needs-input").exists()).toBe(false);
  });
});
