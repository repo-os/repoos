/**
 * Preview target identity + multi-target choice (#0379).
 *
 * `repoos.toml` can declare several `[[preview.targets]]`, each scoped to a set
 * of task `areas`. The quickbar must say *which* target is being served, and
 * when a task's area matches more than one target it must let the user choose
 * instead of silently previewing the first. The single-match case keeps its
 * existing one-click behavior, just gaining the name.
 *
 * Drives the real `TaskDrawer` with stubbed fetch/EventSource and captures the
 * start request's body so the chosen target can be asserted end to end.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
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
    worktreePath: "/tmp/repo-worktrees/feat/test",
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

  emit(t: string, data: unknown): void {
    for (const fn of this.listeners.get(t) ?? []) fn({ data: JSON.stringify(data) });
  }

  close(): void {
    /* noop */
  }
}

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

/** Fetch mock recording every preview POST body so the chosen target is visible. */
function installFetch(task: Task, previewCalls: Array<{ target?: string }>): void {
  vi.stubGlobal("EventSource", FakeEventSource);
  FakeEventSource.instances = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/board"))
        return json({
          version: 1,
          generatedAt: "",
          root: "/tmp/repo",
          taskCount: 1,
          tasks: [task],
          counts: { ...EMPTY_COUNTS, review: task.status === "review" ? 1 : 0 },
        });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/api/agents/queued")) return json({ tasks: [] });
      if (url.endsWith("/preview") && opts?.method === "POST") {
        const body = opts.body ? (JSON.parse(opts.body as string) as { target?: string }) : {};
        previewCalls.push({ target: body.target });
        return json({
          ok: true,
          port: 1234,
          url: "http://127.0.0.1:1234",
          label: body.target ?? "docs",
        });
      }
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      if (url.includes("/version")) return json({ ok: true });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

async function mountDrawer(
  pinia: ReturnType<typeof createPinia>,
  task: Task,
): Promise<ReturnType<typeof mount>> {
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

function startButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll("button").find((b) => b.text().includes("Start preview"));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preview target identity (#0379)", () => {
  it("shows the running preview's target name", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const calls: Array<{ target?: string }> = [];
    const task = makeTask({
      status: "active",
      preview: {
        port: 1234,
        url: "http://127.0.0.1:1234",
        startedAt: "2026-09-17T00:00:00Z",
        label: "docs",
      },
    });
    installFetch(task, calls);
    const repo = useRepoStore();
    await repo.init();

    const wrapper = await mountDrawer(pinia, task);

    const chip = wrapper.find(".preview-target-name");
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toBe("docs");
  });

  it("offers a picker when several targets match and posts the chosen one", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const calls: Array<{ target?: string }> = [];
    const task = makeTask({
      status: "review",
      previewTargets: [
        { name: "App", areas: ["web"] },
        { name: "Web v2", areas: ["web"] },
      ],
    });
    installFetch(task, calls);
    const repo = useRepoStore();
    await repo.init();

    const wrapper = await mountDrawer(pinia, task);

    const select = wrapper.find("select.preview-target-select");
    expect(select.exists()).toBe(true);
    const options = select.findAll("option").map((o) => o.text());
    expect(options).toContain("App");
    expect(options).toContain("Web v2");

    // Never a silent first pick: Start stays disabled until one is chosen.
    expect(startButton(wrapper)?.attributes("disabled")).toBeDefined();

    await select.setValue("Web v2");
    await flush();
    expect(startButton(wrapper)?.attributes("disabled")).toBeUndefined();

    await startButton(wrapper)!.trigger("click");
    await flush();
    expect(calls).toEqual([{ target: "Web v2" }]);
  });

  it("keeps the single-target case one click and shows its name", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const calls: Array<{ target?: string }> = [];
    const task = makeTask({
      status: "review",
      previewTargets: [{ name: "docs", areas: ["web"] }],
    });
    installFetch(task, calls);
    const repo = useRepoStore();
    await repo.init();

    const wrapper = await mountDrawer(pinia, task);

    expect(wrapper.find("select.preview-target-select").exists()).toBe(false);
    const chip = wrapper.find(".preview-target-name");
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toBe("docs");

    expect(startButton(wrapper)?.attributes("disabled")).toBeUndefined();
    await startButton(wrapper)!.trigger("click");
    await flush();
    expect(calls).toEqual([{ target: "docs" }]);
  });
});
