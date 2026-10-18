/**
 * #0832 — review-rounds-exhausted card summary: strip duplicated verdict, clamp
 * long stored details; full report stays on the Review tab.
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

const FULL_WHY =
  "Three UI regressions remain in the task drawer and the contrast audit still fails on the settings page; also re-check the handoff shots.";
const STORED_DETAIL = `\`needs some work\` — ${FULL_WHY}`;
const FULL_REPORT = `## Verdict\n${STORED_DETAIL}\n\n## Bugs\n- Contrast failure on settings.\n`;

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0832",
  title: "Review rounds exhausted fixture",
  type: "chore",
  status: "review",
  priority: "p3",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/x",
  tags: [],
  needsInput: true,
  needsInputReason: "review-rounds-exhausted",
  needsInputDetail: STORED_DETAIL,
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/0832-fixture.md",
  absPath: "/tmp/repo/work/0832-fixture.md",
  body: "",
  extra: { review_rounds: 2 },
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
  automaticReview: { running: false, enabled: true },
  ...over,
});

function seedReview(repo: ReturnType<typeof useRepoStore>, taskId: string): void {
  repo.reviews = {
    [taskId]: {
      running: false,
      enabled: true,
      lines: [],
      report: {
        id: taskId,
        at: new Date().toISOString(),
        agent: "reviewer",
        cli: "opencode",
        model: "default",
        branch: "feat/x",
        state: "ok",
        markdown: FULL_REPORT,
      },
    },
  };
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

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 1, done: 0 };
const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

const REVIEW_REPORT = {
  id: "0832",
  at: "2026-10-18T00:00:00Z",
  agent: "reviewer",
  cli: "opencode",
  model: "default",
  branch: "feat/x",
  state: "ok" as const,
  markdown: FULL_REPORT,
};

function stubDrawerApi(task: Task): void {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: EMPTY_COUNTS, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/review"))
        return json({
          ok: true,
          running: false,
          enabled: true,
          review: REVIEW_REPORT,
          lines: [],
        });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

async function mountDrawer(pinia: Pinia, task: Task): Promise<ReturnType<typeof mount>> {
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

describe("review-rounds-exhausted card detail (#0832)", () => {
  it("clamps long detail and does not repeat the verdict under the status chip", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    seedReview(repo, "0832");
    const task = makeTask();
    const wrapper = mount(TaskCard, { props: { task, dragEnabled: false } });

    const detail = wrapper.get(".tc-needs-detail");
    expect(detail.classes()).toContain("tc-needs-detail--clamp");
    expect(detail.text()).toContain("contrast audit");
    expect(detail.text().toLowerCase()).not.toContain("needs some work");
    const hint = wrapper.get(".tc-hint");
    expect(hint.text()).toContain("Review still finding issues");
  });

  it("keeps the full verdict line on the Review tab", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask();
    stubDrawerApi(task);
    const repo = useRepoStore();
    await repo.init();

    const wrapper = await mountDrawer(pinia, task);
    const ui = useUiStore();
    ui.activeTab = "review";
    await flush();

    expect(wrapper.text()).toContain(FULL_WHY);
    expect(wrapper.text()).toContain("Contrast failure on settings");
    const banner = wrapper.find(".drawer-critical .agent-waiting-detail");
    if (banner.exists()) {
      expect(banner.text().toLowerCase()).not.toContain("needs some work");
    }
  });
});
