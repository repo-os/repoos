import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  extractConflicts,
  DirtyMainError,
  MoveToDoneError,
  useRepoStore,
} from "../src/stores/repo";
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
  ...over,
});

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const jsonFail = async (data: unknown) => ({ ok: false, status: 400, json: async () => data });

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

/** Stub /done to fail once, then succeed, driven by the returned queue. */
function stubDone(failures: Record<string, { ok: boolean; error?: string }>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/done")) {
        const outcome = failures["/done"];
        if (outcome?.ok) return json({ ok: true, merged: true, conflicts: [], ff: true });
        return jsonFail({ ok: false, error: outcome?.error ?? "could not complete task" });
      }
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

beforeEach(() => {
  setActivePinia(createPinia());
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  stubDone({ "/done": { ok: false, error: "merge conflict: src/a.ts, src/b.ts" } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("inline move-to-done errors", () => {
  it("stores the failure per task and throws a MoveToDoneError without a toast", async () => {
    const repo = useRepoStore();
    await repo.init();
    const task = makeTask({ id: "0042" });

    await expect(repo.completeTask(task)).rejects.toBeInstanceOf(MoveToDoneError);
    expect(repo.doneErrorFor("0042")).toEqual({
      message: "Merge conflict in 2 files.",
      conflicts: ["src/a.ts", "src/b.ts"],
      step: "merge",
      detail: "merge conflict: src/a.ts, src/b.ts",
      hint: "RepoOS couldn't sync this branch with main automatically — resolve the conflicting files in the worktree, then retry.",
    });
    // The inline error replaces the global toast — nothing is pushed.
    expect(repo.toasts).toHaveLength(0);
  });

  it("does not leak the error onto another task", async () => {
    const repo = useRepoStore();
    await repo.init();
    await expect(repo.completeTask(makeTask({ id: "0001" }))).rejects.toThrow();
    expect(repo.doneErrorFor("0001")).not.toBeNull();
    expect(repo.doneErrorFor("9999")).toBeNull();
    expect(repo.doneErrorFor("0002")).toBeNull();
  });

  it("records the live close-out step in the error", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    es.emit("task.progress", { type: "task.progress", id: "0042", step: "check" });
    await expect(repo.completeTask(makeTask({ id: "0042" }))).rejects.toThrow();
    expect(repo.doneErrorFor("0042")?.step).toBe("check");
  });

  it("maps a background check-failure via SSE to output, never conflicts (0215)", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    es.emit("task.progress", {
      type: "task.progress",
      id: "0042",
      step: "failed",
      phase: "validating",
      detail: "check failed: \u001b[31m✗\u001b[0m deletion detected by watcher",
    });

    const err = repo.doneErrorFor("0042");
    expect(err).not.toBeNull();
    expect(err?.message).not.toContain("\u001b[");
    expect(err?.message).toContain("deletion detected by watcher");
    expect(err?.conflicts).toEqual([]);
    expect(err?.hint).not.toMatch(/conflict/i);
  });

  it("maps a background conflict via SSE to conflict guidance (0215)", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    es.emit("task.progress", {
      type: "task.progress",
      id: "0042",
      step: "failed",
      phase: "validating",
      detail:
        "merge conflict in src/a.ts — resolve it in the feature branch's own worktree (merge main into the branch), then retry",
    });

    const err = repo.doneErrorFor("0042");
    expect(err).not.toBeNull();
    expect(err?.conflicts).toEqual(["src/a.ts"]);
    expect(err?.hint).toMatch(/resolve the conflicting files/i);
  });

  it("replaces the previous error on retry and clears it on success", async () => {
    const repo = useRepoStore();
    await repo.init();
    const task = makeTask({ id: "0042" });

    await expect(repo.completeTask(task)).rejects.toThrow();
    expect(repo.doneErrorFor("0042")?.message).toBe("Merge conflict in 2 files.");

    // A retry fails with a different message → replaced, still scoped.
    stubDone({ "/done": { ok: false, error: "repoos check failed: build" } });
    await expect(repo.completeTask(task)).rejects.toThrow();
    expect(repo.doneErrorFor("0042")?.message).toBe("The validation check failed — build");
    expect(repo.doneErrorFor("0042")?.conflicts).toEqual([]);
    // A check failure never suggests resolving conflicts.
    expect(repo.doneErrorFor("0042")?.hint).not.toMatch(/conflict/i);

    // A successful retry removes it.
    stubDone({ "/done": { ok: true } });
    await repo.completeTask(task);
    expect(repo.doneErrorFor("0042")).toBeNull();
  });

  it("clears the error once the task leaves review", async () => {
    const repo = useRepoStore();
    await repo.init();
    await expect(repo.completeTask(makeTask({ id: "0042" }))).rejects.toThrow();
    expect(repo.doneErrorFor("0042")).not.toBeNull();

    const es = FakeEventSource.instances[0];
    es.emit("task.updated", {
      type: "task.updated",
      task: makeTask({ id: "0042", status: "done" }),
      prev: { status: "review" },
    });
    expect(repo.doneErrorFor("0042")).toBeNull();
  });

  it("clears the error when the task is deleted", async () => {
    const repo = useRepoStore();
    await repo.init();
    await expect(repo.completeTask(makeTask({ id: "0042" }))).rejects.toThrow();
    expect(repo.doneErrorFor("0042")).not.toBeNull();

    const es = FakeEventSource.instances[0];
    es.emit("task.deleted", { type: "task.deleted", id: "0042" });
    expect(repo.doneErrorFor("0042")).toBeNull();
  });

  it("clears the error when a review task is moved to another status", async () => {
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
        if (url.includes("/api/board") || url.includes("/api/index"))
          return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/done"))
          return jsonFail({ ok: false, error: "merge conflict: src/a.ts" });
        if (url.includes("/api/tasks/0042") && String(url).endsWith("/0042"))
          return json(makeTask({ id: "0042", status: "ready" }));
        throw new Error("unexpected fetch: " + url);
      }),
    );
    const repo = useRepoStore();
    await repo.init();
    await expect(repo.completeTask(makeTask({ id: "0042" }))).rejects.toThrow();
    expect(repo.doneErrorFor("0042")).not.toBeNull();

    await repo.setStatus(makeTask({ id: "0042" }), "ready");
    expect(repo.doneErrorFor("0042")).toBeNull();
  });
});

const jsonNeedsCommit = async () => ({
  ok: false,
  status: 409,
  json: async () => ({
    ok: false,
    error: "main has 1 uncommitted file blocking close-out",
    needsCommit: true,
    dirtyFiles: ["dist/.build-info.json"],
  }),
});

describe("dirty-main guard (0204)", () => {
  it("stores the dirty files and throws a DirtyMainError when main is dirty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
        if (url.includes("/api/board") || url.includes("/api/index"))
          return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/done")) return jsonNeedsCommit();
        throw new Error("unexpected fetch: " + url);
      }),
    );
    const repo = useRepoStore();
    await repo.init();
    const task = makeTask({ id: "0042" });

    await expect(repo.completeTask(task)).rejects.toBeInstanceOf(DirtyMainError);
    expect(repo.dirtyMainFor("0042")).toEqual(["dist/.build-info.json"]);
    // No inline move-to-done error: this isn't a failure of the close-out.
    expect(repo.doneErrorFor("0042")).toBeNull();
    expect(repo.toasts).toHaveLength(0);
  });

  it("clears the pending confirmation via clearDirtyMain (Cancel)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
        if (url.includes("/api/board") || url.includes("/api/index"))
          return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/done")) return jsonNeedsCommit();
        throw new Error("unexpected fetch: " + url);
      }),
    );
    const repo = useRepoStore();
    await repo.init();
    const task = makeTask({ id: "0042" });

    await expect(repo.completeTask(task)).rejects.toThrow();
    expect(repo.dirtyMainFor("0042").length).toBeGreaterThan(0);
    repo.clearDirtyMain("0042");
    expect(repo.dirtyMainFor("0042")).toEqual([]);
  });

  it("proceeds (no modal) when commitDirty is set and the server accepts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
        if (url.includes("/api/board") || url.includes("/api/index"))
          return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/done")) {
          const body = init?.body ? JSON.parse(String(init.body)) : {};
          if (body.commitDirty) return json({ ok: true, merged: true, conflicts: [], ff: true });
          return jsonNeedsCommit();
        }
        throw new Error("unexpected fetch: " + url);
      }),
    );
    const repo = useRepoStore();
    await repo.init();
    const task = makeTask({ id: "0042" });

    const result = await repo.completeTask(task, { commitDirty: true });
    expect(result.ok).toBe(true);
    expect(repo.dirtyMainFor("0042")).toEqual([]);
  });

  it("does not toast a DirtyMainError via onError", async () => {
    vi.useFakeTimers();
    const repo = useRepoStore();
    await repo.init();
    repo.onError(new DirtyMainError("0042", ["dist/.build-info.json"]));
    expect(repo.toasts).toHaveLength(0);
    expect(repo.feed.some((f) => f.kind === "error")).toBe(true);
  });
});

describe("move-to-done toast suppression", () => {
  it("does not toast a MoveToDoneError but still feeds it", async () => {
    vi.useFakeTimers();
    const repo = useRepoStore();
    await repo.init();
    repo.onError(new MoveToDoneError("0042", "merge conflict: src/a.ts"));
    expect(repo.toasts).toHaveLength(0);
    expect(repo.feed.some((f) => f.kind === "error")).toBe(true);
  });

  it("still toasts other failures via onError", async () => {
    const repo = useRepoStore();
    await repo.init();
    repo.onError(new Error("start work exploded"));
    expect(repo.toasts.some((t) => t.message === "start work exploded")).toBe(true);
  });
});

describe("extractConflicts", () => {
  it("pulls conflicting file names out of the server message", () => {
    expect(extractConflicts("merge conflict: src/a.ts, src/b.ts")).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
  });

  it("returns an empty list for unrelated errors", () => {
    expect(extractConflicts("repoos check failed: build")).toEqual([]);
    expect(extractConflicts("merge conflict")).toEqual([]);
  });
});
