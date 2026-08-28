import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

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
  branch: "feat/test-branch",
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
    worktreePath: "/tmp/repo/.worktrees/0001",
    dirty: false,
  },
  preview: null,
  automaticReview: { running: false, enabled: true },
  ...over,
});

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

// jsdom has no Element.scrollTo; TaskDrawer calls it while streaming session output.
(Element.prototype as unknown as { scrollTo: () => void }).scrollTo ??= () => {};

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

const REPORT = {
  id: "0001",
  at: "2026-08-28T10:00:00.000Z",
  agent: "reviewer",
  cli: "opencode",
  model: "m",
  branch: "feat/test-branch",
  state: "ok",
  markdown: "## Verdict\ngood to go",
};

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await nextTick();
}

describe("Send to engineer note dialog (#0295)", () => {
  it("still sends when opening the dialog dismissed the drawer's modal", async () => {
    const pinia: Pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask();
    const calls: Array<{ url: string; opts?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts?: RequestInit) => {
        calls.push({ url, opts });
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [task], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/api/agents/queued")) return json({ tasks: [] });
        if (url.includes("/review"))
          return json({ ok: true, running: false, enabled: true, review: REPORT, lines: [] });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (url.endsWith("/api/tasks/0001") && opts?.method === "PATCH")
          return json({ ...task, status: "active" });
        if (url.endsWith("/start") && opts?.method === "POST") return json({ ok: true });
        return json({ ok: true });
      }),
    );
    const repo = useRepoStore();
    await repo.init();
    const ui = useUiStore();

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    await router.push("/");
    await router.isReady();
    ui.open(task);
    const wrapper = mount(TaskDrawer, {
      global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
    });
    await flush();

    // The reviewer report has loaded, so the "Send engineer" button is enabled.
    const sendBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Send engineer"));
    expect(sendBtn, "Send engineer button present").toBeTruthy();
    expect(sendBtn!.attributes("disabled")).toBeUndefined();

    await sendBtn!.trigger("click");
    await flush();

    // Radix dismisses the drawer's modal the moment the body-teleported dialog
    // takes focus — reproduce that here.
    ui.close();
    await flush();
    expect(ui.active).toBeNull();

    const confirmBtn = wrapper
      .findAll("button")
      .find((b) => b.text().trim().startsWith("Send to engineer"));
    expect(confirmBtn, "dialog confirm button present").toBeTruthy();
    await confirmBtn!.trigger("click");
    await flush();

    const patch = calls.find(
      (c) => c.url.endsWith("/api/tasks/0001") && c.opts?.method === "PATCH",
    );
    expect(patch, "task was patched to active").toBeTruthy();
    expect(JSON.parse(String(patch!.opts!.body))).toMatchObject({ status: "active" });
    expect(
      calls.some((c) => c.url.endsWith("/start") && c.opts?.method === "POST"),
      "engineer was resumed",
    ).toBe(true);
    expect(repo.toasts.some((t) => /not ready/i.test(t.message))).toBe(false);
  });
});
