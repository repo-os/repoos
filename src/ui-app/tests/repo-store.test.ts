import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { COLUMNS, useRepoStore } from "../src/stores/repo";
import type { Task } from "../src/types";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0001",
  title: "Test task",
  type: "feature",
  status: "inbox",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "",
  tags: [],
  created_at: null,
  updated_at: null,
  path: "work/0001-test.md",
  absPath: "/tmp/repo/work/0001-test.md",
  body: "",
  extra: {},
  git: { branchExists: false, lastCommit: null, lastCommitAt: null },
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

function mockFetch(): void {
  const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/api/health"))
      return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
    if (url.includes("/api/index"))
      return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
    if (url.includes("/api/agents/running"))
      return json({ tasks: [] });
    if (url.includes("/start"))
      return json({ ok: true });
    if (url.includes("/pause"))
      return json({ ok: true });
    throw new Error("unexpected fetch: " + url);
  });
  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(() => {
  setActivePinia(createPinia());
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  mockFetch();
});

describe("status helpers", () => {
  it("maps every status to a color with a fallback", () => {
    const repo = useRepoStore();
    for (const c of COLUMNS) expect(repo.statusColor(c.id)).toBe(c.color);
    expect(repo.statusColor("nope")).toBe("#566081");
  });
});

describe("repo store SSE ingestion", () => {
  it("loads health + index on init", async () => {
    const repo = useRepoStore();
    expect(repo.loading).toBe(true);
    await repo.init();
    expect(repo.loading).toBe(false);
    expect(repo.health?.root).toBe("/tmp/repo");
    expect(repo.repoName).toBe("repo");
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("applies task.created events to tasks, counts, and feed", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    es.emit("task.created", { type: "task.created", task: makeTask() });
    expect(repo.tasks).toHaveLength(1);
    expect(repo.counts.inbox).toBe(1);
    expect(repo.eventCount).toBe(1);
    expect(repo.feed[0].kind).toBe("task.created");
    expect(repo.feed[0].msg).toContain("#0001");
  });

  it("updates the board counts when a task moves status", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    es.emit("task.created", { type: "task.created", task: makeTask() });
    es.emit("task.updated", {
      type: "task.updated",
      task: makeTask({ status: "active" }),
      prev: { status: "inbox" },
    });
    expect(repo.counts.inbox).toBe(0);
    expect(repo.counts.active).toBe(1);
    expect(repo.tasks[0].status).toBe("active");
  });

  it("removes tasks on task.deleted", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    es.emit("task.created", { type: "task.created", task: makeTask() });
    es.emit("task.deleted", { type: "task.deleted", id: "0001" });
    expect(repo.tasks).toHaveLength(0);
    expect(repo.feed[0].kind).toBe("task.deleted");
  });

  it("caps the feed at 30 items", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    for (let i = 0; i < 40; i++) {
      es.emit("task.created", { type: "task.created", task: makeTask({ id: String(i).padStart(4, "0") }) });
    }
    expect(repo.feed.length).toBe(30);
  });
});

describe("agent running state", () => {
  it("marks a task running on agent.running and clears it on agent.exited", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    expect(repo.isRunning("0001")).toBe(false);

    es.emit("agent.running", { type: "agent.running", id: "0001" });
    expect(repo.isRunning("0001")).toBe(true);
    expect(repo.runningIds).toEqual(["0001"]);
    expect(repo.feed[0].kind).toBe("agent.running");

    es.emit("agent.exited", { type: "agent.exited", id: "0001" });
    expect(repo.isRunning("0001")).toBe(false);
    expect(repo.runningIds).toEqual([]);
  });

  it("does not duplicate a task in the running list", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    es.emit("agent.running", { type: "agent.running", id: "0001" });
    es.emit("agent.running", { type: "agent.running", id: "0001" });
    expect(repo.runningIds).toEqual(["0001"]);
  });

  it("startWork and pauseWork hit the launch endpoints", async () => {
    const repo = useRepoStore();
    await repo.init();
    const task = makeTask({ status: "ready" });
    await expect(repo.startWork(task)).resolves.toBeUndefined();
    await expect(repo.pauseWork(makeTask({ status: "active" }))).resolves.toBeUndefined();
  });
});
