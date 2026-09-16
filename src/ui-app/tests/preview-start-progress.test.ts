/**
 * Preview start feedback (#0374).
 *
 * `startPreview` does not resolve until the whole server-side boot has
 * finished, which for a slow preview command can be minutes. The drawer must
 * therefore show a live, visibly-progressing state — a spinner plus a ticking
 * elapsed time — for the entire wait, not merely a greyed-out button. A fast
 * start must clear that state without any artificial minimum.
 *
 * Drives the real `TaskDrawer` component with stubbed fetch/EventSource so the
 * preview POST stays pending for as long as the test wants.
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

/** Fetch mock that keeps the preview POST gated behind a caller-released promise. */
function installFetch(holdPreview: boolean) {
  let release: (() => void) | null = null;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  vi.stubGlobal("EventSource", FakeEventSource);
  FakeEventSource.instances = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({
          tasks: [makeTask()],
          counts: { ...EMPTY_COUNTS, review: 1 },
          taskCount: 1,
        });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.endsWith("/preview") && opts?.method === "POST") {
        if (holdPreview) await gate;
        return json({ ok: true, port: 1234, url: "http://127.0.0.1:1234" });
      }
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      throw new Error("unexpected fetch: " + url);
    }),
  );
  return () => release?.();
}

async function mountDrawer(
  pinia: ReturnType<typeof createPinia>,
): Promise<ReturnType<typeof mount>> {
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  const ui = useUiStore();
  ui.open(makeTask());
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

let clearFetchState: (() => void) | null = null;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearFetchState = null;
});

describe("preview start feedback (#0374)", () => {
  it("shows a live spinner and ticking elapsed time for the full slow wait", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    clearFetchState = installFetch(true);
    const repo = useRepoStore();
    await repo.init();
    const wrapper = await mountDrawer(pinia);

    vi.useFakeTimers();

    const btn = startButton(wrapper);
    expect(btn, "Start preview button should render for a branchless review task").toBeTruthy();
    await btn!.trigger("click");
    await flush();

    // Immediate progress state, distinct from a disabled button: animated
    // indicator + explicit "starting" label.
    const progress = wrapper.find(".preview-progress");
    expect(progress.exists()).toBe(true);
    expect(progress.text()).toContain("Starting preview…");
    expect(progress.find(".ai").exists()).toBe(true);
    expect(wrapper.find("button").text()).not.toContain("Start preview");

    // No "0s" counter in the first second (keeps a fast start from flashing).
    expect(progress.text()).not.toContain("0s");

    // After a second it ticks, so a 5-second and a 3-minute wait differ.
    vi.advanceTimersByTime(1500);
    await flush();
    expect(wrapper.find(".preview-progress").text()).toContain("1s");

    // Resolving clears the state — nothing lingers past the real wait.
    clearFetchState!();
    await flush();
    await flush();
    expect(wrapper.find(".preview-progress").exists()).toBe(false);
    expect(startButton(wrapper)?.text()).toContain("Start preview");
  });

  it("clears immediately for a fast start (no artificial minimum)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    clearFetchState = installFetch(false);
    const repo = useRepoStore();
    await repo.init();
    const wrapper = await mountDrawer(pinia);

    const btn = startButton(wrapper);
    await btn!.trigger("click");
    await flush();
    await flush();

    expect(wrapper.find(".preview-progress").exists()).toBe(false);
    expect(startButton(wrapper)?.text()).toContain("Start preview");
  });
});
