/**
 * The task drawer's live check chip (#0564): "Checks running on <machine> ·
 * elapsed" while a gate runs, the result inline afterwards. The machine of the
 * REMOTE half only lands in the durable history mid-gate, so the chip must
 * re-fetch the rows on a short interval while running — not just once when the
 * run identity changes. The done state also reads the durable history, so a
 * server restart (in-memory runs gone) still shows the result.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useUiStore } from "../src/stores/ui";
import { useRepoStore } from "../src/stores/repo";
import type { Task, CheckRunRow } from "../src/types";

const T0 = new Date("2026-09-28T12:00:00Z").getTime();

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

const makeTask = (over: Partial<Task> = {}): Task =>
  ({
    id: "0001",
    title: "Test task",
    type: "feature",
    status: "active",
    priority: "p2",
    area: "web",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "",
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
      branchExists: false,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    preview: null,
    automaticReview: { running: false, enabled: true },
    ...over,
  }) as Task;

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

/** Mutable payload the `/api/check-runs` stub serves. */
let checkRunsPayload: CheckRunRow[] = [];

function row(over: Partial<CheckRunRow> = {}): CheckRunRow {
  return {
    id: 1,
    taskId: "0001",
    phase: "pre-review",
    machine: "macbook",
    remote: false,
    scope: "full",
    startedAt: new Date(T0 - 60_000).toISOString(),
    durationMs: 120_000,
    outcome: "pass",
    failedStep: null,
    skippedSteps: [],
    failedTests: [],
    detail: null,
    ...over,
  };
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

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("task drawer check chip (#0564)", () => {
  it("starts with the local machine from the SSE event, then upgrades to the remote host when its durable row lands mid-gate", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    checkRunsPayload = [];

    class FakeES {
      addEventListener(): void {}
      close(): void {}
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/check-runs")) return json({ ok: true, runs: checkRunsPayload });
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/review"))
          return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (url.includes("/checks")) return json({ ok: true, runs: [] });
        if (url.includes("/logs")) return json({ ok: true, logs: [] });
        throw new Error("unexpected fetch: " + url);
      }),
    );

    const repo = useRepoStore();
    // The in-memory run the SSE started event created — running on THIS machine.
    repo.taskChecks["0001"] = [
      {
        id: "0001-handoff-finalize-1",
        taskId: "0001",
        kind: "handoff-finalize",
        startedAt: new Date(T0 - 10_000).toISOString(),
        finishedAt: null,
        durationMs: null,
        running: true,
        passed: null,
        code: null,
        output: "",
        scope: "full",
        machine: "macbook",
      },
    ];

    const wrapper = await mountDrawer(pinia, makeTask());
    const chip = () => wrapper.find(".ck-chip");
    expect(chip().exists()).toBe(true);
    expect(chip().classes()).toContain("ck-chip-running");
    expect(chip().text()).toContain("Checks running on macbook");

    // The remote half completes mid-gate and lands in the durable history.
    checkRunsPayload = [
      row({
        id: 2,
        machine: "mini",
        remote: true,
        startedAt: new Date(T0 - 5_000).toISOString(),
        durationMs: 4_000,
        outcome: "pass",
      }),
    ];
    // Advance past the 5s rows poll; the chip must pick the host up.
    await vi.advanceTimersByTimeAsync(5_100);
    await flush();
    expect(chip().text()).toContain("Checks running on mini");

    // Clicking opens the Debug tab.
    await chip().trigger("click");
    await flush();
    expect(useUiStore().activeTab).toBe("debug");
  });

  it("rehydrates a mid-gate run after a page reload (0564 review)", async () => {
    // A reload wipes the store's in-memory slice, and SSE only delivers
    // events from now on — so the drawer must bootstrap from
    // /api/tasks/:id/checks (which still has the running run) or the chip
    // would show the stale durable row instead of "Checks running".
    const pinia = createPinia();
    setActivePinia(pinia);
    checkRunsPayload = [];
    const runningRun = {
      id: "0001-handoff-finalize-1",
      taskId: "0001",
      kind: "handoff-finalize",
      startedAt: new Date(T0 - 10_000).toISOString(),
      finishedAt: null,
      durationMs: null,
      running: true,
      passed: null,
      code: null,
      output: "",
      scope: "full",
      machine: "macbook",
    };

    class FakeES {
      addEventListener(): void {}
      close(): void {}
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/check-runs")) return json({ ok: true, runs: checkRunsPayload });
        if (url.includes("/checks")) return json({ ok: true, runs: [runningRun] });
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/review"))
          return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (url.includes("/logs")) return json({ ok: true, logs: [] });
        throw new Error("unexpected fetch: " + url);
      }),
    );

    const wrapper = await mountDrawer(pinia, makeTask());
    const chip = wrapper.find(".ck-chip");
    expect(chip.exists()).toBe(true);
    expect(chip.classes()).toContain("ck-chip-running");
    expect(chip.text()).toContain("Checks running on macbook");
  });

  it("shows the durable result inline when the in-memory run is gone (server restart)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    // A local gate row from an hour ago — after a restart there is no
    // in-memory run, so this is the only record of the result.
    checkRunsPayload = [
      row({
        machine: "macbook",
        remote: false,
        startedAt: new Date(T0 - 3_600_000).toISOString(),
        durationMs: 120_000,
        outcome: "pass",
      }),
    ];

    class FakeES {
      addEventListener(): void {}
      close(): void {}
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/check-runs")) return json({ ok: true, runs: checkRunsPayload });
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/review"))
          return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (url.includes("/checks")) return json({ ok: true, runs: [] });
        if (url.includes("/logs")) return json({ ok: true, logs: [] });
        throw new Error("unexpected fetch: " + url);
      }),
    );

    const wrapper = await mountDrawer(pinia, makeTask());
    const chip = wrapper.find(".ck-chip");
    expect(chip.exists()).toBe(true);
    expect(chip.classes()).toContain("ck-chip-pass");
    expect(chip.text()).toContain("Checks passed · 2m");
    expect(chip.attributes("title")).toContain("Last recorded check run");

    // A week-old row is stale — the tree it tested is long gone; no chip.
    checkRunsPayload = [row({ startedAt: new Date(T0 - 8 * 86_400_000).toISOString() })];
    const pinia2 = createPinia();
    setActivePinia(pinia2);
    const wrapper2 = await mountDrawer(pinia2, makeTask());
    expect(wrapper2.find(".ck-chip").exists()).toBe(false);
  });

  it("prefers the local row for the inline result (a remote row is one half of a gate)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    checkRunsPayload = [
      row({
        id: 2,
        machine: "mini",
        remote: true,
        startedAt: new Date(T0 - 120_000).toISOString(),
        durationMs: 100_000,
      }),
      row({
        id: 3,
        machine: "macbook",
        remote: false,
        startedAt: new Date(T0 - 20_000).toISOString(),
        durationMs: 15_000,
        outcome: "fail",
        failedStep: "tests",
      }),
    ];

    class FakeES {
      addEventListener(): void {}
      close(): void {}
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/check-runs")) return json({ ok: true, runs: checkRunsPayload });
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/review"))
          return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (url.includes("/checks")) return json({ ok: true, runs: [] });
        if (url.includes("/logs")) return json({ ok: true, logs: [] });
        throw new Error("unexpected fetch: " + url);
      }),
    );

    const wrapper = await mountDrawer(pinia, makeTask());
    const chip = wrapper.find(".ck-chip");
    expect(chip.classes()).toContain("ck-chip-fail");
    expect(chip.text()).toContain("Checks failed · 15s");
  });

  it("shows the durable skipped gate as 'No checks configured', never as passed (#0592)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    checkRunsPayload = [
      row({
        machine: "macbook",
        remote: false,
        startedAt: new Date(T0 - 3_600_000).toISOString(),
        durationMs: 0,
        // The CLI child exited 0, but this repo has no check plan.
        outcome: "skipped",
        detail: "No check plan configured — nothing to verify.",
      }),
    ];

    class FakeES {
      addEventListener(): void {}
      close(): void {}
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/check-runs")) return json({ ok: true, runs: checkRunsPayload });
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/review"))
          return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (url.includes("/logs")) return json({ ok: true, logs: [] });
        throw new Error("unexpected fetch: " + url);
      }),
    );

    const wrapper = await mountDrawer(pinia, makeTask());
    const chip = wrapper.find(".ck-chip");
    expect(chip.exists()).toBe(true);
    expect(chip.classes()).toContain("ck-chip-skip");
    expect(chip.classes()).not.toContain("ck-chip-pass");
    expect(chip.text()).toContain("No checks configured");
  });

  it("reads the skip from the in-memory run's output when the durable row has not landed yet (#0592)", async () => {
    // A skipped gate exits 0 — the exit code alone would read as a pass, so
    // the chip must consult the streamed output's notice.
    const pinia = createPinia();
    setActivePinia(pinia);
    checkRunsPayload = [];

    class FakeES {
      addEventListener(): void {}
      close(): void {}
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/check-runs")) return json({ ok: true, runs: [] });
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/review"))
          return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (url.includes("/checks"))
          return json({
            ok: true,
            runs: [
              {
                id: "0001-handoff-finalize-1",
                taskId: "0001",
                kind: "handoff-finalize",
                startedAt: new Date(T0 - 10_000).toISOString(),
                finishedAt: new Date(T0 - 9_000).toISOString(),
                durationMs: 300,
                running: false,
                passed: true, // exit 0
                code: 0,
                output: "  ⚠ No check plan configured — nothing to verify.\n",
                scope: "full",
                machine: "macbook",
              },
            ],
          });
        if (url.includes("/logs")) return json({ ok: true, logs: [] });
        throw new Error("unexpected fetch: " + url);
      }),
    );

    const wrapper = await mountDrawer(pinia, makeTask());
    const chip = wrapper.find(".ck-chip");
    expect(chip.classes()).toContain("ck-chip-skip");
    expect(chip.text()).toContain("No checks configured");
  });
});
