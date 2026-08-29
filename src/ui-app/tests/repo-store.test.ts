import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { COLUMNS, useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
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
    if (url.includes("/api/board") || url.includes("/api/index"))
      return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
    if (url.includes("/api/agents/running"))
      return json({ tasks: [] });
    if (url.includes("/start"))
      return json({ ok: true });
    if (url.includes("/pause"))
      return json({ ok: true });
    if (url.includes("/output"))
      return json({
        ok: true,
        lines: [{ s: "out", d: "resumed transcript" }],
        stats: {
          accumulatedMs: 4200,
          turnStartedAt: null,
          lastOutputAt: "2026-08-11T00:00:00Z",
          tokens: 150,
          costUsd: 0.02,
          stalled: false,
        },
      });
    if (url.includes("/preview"))
      return json({ ok: true, port: 7234, url: "http://127.0.0.1:7234" });
    if (url.includes("/message"))
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

describe("freeform task creation", () => {
  it("posts the explanation and returns the created task", async () => {
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    const task = makeTask({ id: "0043", title: "Generated task" });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
      if (url.includes("/api/agents/running"))
        return json({ tasks: [] });
      if (url.includes("/api/tasks/freeform"))
        return json({ ok: true, fallback: false, task });
      throw new Error("unexpected fetch: " + url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const repo = useRepoStore();
    await repo.init();
    const res = await repo.createFreeformTask("make issues editable");
    expect(res.task.id).toBe("0043");
    expect(res.fallback).toBe(false);
    const call = vi.mocked(fetch).mock.calls.find((c) => String(c[0]).includes("/freeform"));
    expect(call).toBeTruthy();
    const opts = call![1] as RequestInit;
    expect(JSON.parse(opts.body as string)).toEqual({
      explanation: "make issues editable",
    });
  });

  it("surfaces a fallback draft when no PM agent is configured", async () => {
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    const draft = makeTask({ id: "0043", status: "draft" });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
      if (url.includes("/api/agents/running"))
        return json({ tasks: [] });
      if (url.includes("/api/tasks/freeform"))
        return json({ ok: true, fallback: true, fallbackReason: "no-pm-agent", task: draft });
      throw new Error("unexpected fetch: " + url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const repo = useRepoStore();
    await repo.init();
    const res = await repo.createFreeformTask("rough idea");
    expect(res.fallback).toBe(true);
    expect(res.fallbackReason).toBe("no-pm-agent");
    expect(res.task.status).toBe("draft");
  });

  it("passes the runId through so streamed agent.output can be correlated", async () => {
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    const task = makeTask({ id: "0044", title: "Generated task" });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
      if (url.includes("/api/agents/running"))
        return json({ tasks: [] });
      if (url.includes("/api/tasks/freeform"))
        return json({ ok: true, fallback: false, task });
      throw new Error("unexpected fetch: " + url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const repo = useRepoStore();
    await repo.init();
    await repo.createFreeformTask("rough idea", "run-abc");
    const call = vi.mocked(fetch).mock.calls.find((c) => String(c[0]).includes("/freeform"));
    expect(call).toBeTruthy();
    const opts = call![1] as RequestInit;
    expect(JSON.parse(opts.body as string)).toEqual({
      explanation: "rough idea",
      runId: "run-abc",
    });
  });

  it("throws when the freeform create fails", async () => {
    const json = async (data: unknown) => ({ ok: false, status: 500, json: async () => data });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
      if (url.includes("/api/agents/running"))
        return json({ tasks: [] });
      if (url.includes("/api/tasks/freeform"))
        return json({ error: "explanation is required" });
      throw new Error("unexpected fetch: " + url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const repo = useRepoStore();
    await repo.init();
    await expect(repo.createFreeformTask("")).rejects.toThrow("explanation is required");
  });
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

  it("keeps an SSE-hydrated full body when a reconnect refreshes the board", async () => {
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    const fullTask = makeTask({ body: "Full task body that must remain searchable after reconnect." });
    const boardTask = { ...fullTask, bodyPreview: "Board preview" };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/board"))
        return json({ tasks: [boardTask], counts: { ...EMPTY_COUNTS, inbox: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      throw new Error("unexpected fetch: " + url);
    }));

    const repo = useRepoStore();
    await repo.init();
    expect(repo.tasks[0].body).toBe("Board preview");

    const es = FakeEventSource.instances[0];
    es.emit("task.updated", { type: "task.updated", task: fullTask, prev: {}, at: "2026-08-16T00:00:00Z" });
    expect(repo.tasks[0].body).toBe(fullTask.body);

    // The first open is the initial connection; the second is a reconnect and
    // triggers the lightweight board refresh.
    es.onopen?.();
    es.onopen?.();
    await vi.waitFor(() => expect(repo.tasks[0].body).toBe(fullTask.body));
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

  it("reconciles stale running markers when SSE reconnects", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    es.emit("agent.running", { type: "agent.running", id: "0001" });
    expect(repo.isRunning("0001")).toBe(true);

    // A replacement server never observed the old process exit. Its `hello`
    // must replace the browser's event-derived marker with the live set.
    es.emit("hello", { type: "hello", taskCount: 0, at: "2026-08-16T00:00:00.000Z" });
    await vi.waitFor(() => expect(repo.isRunning("0001")).toBe(false));
  });

  it("startWork and pauseWork hit the launch endpoints", async () => {
    const repo = useRepoStore();
    await repo.init();
    const task = makeTask({ status: "ready" });
    await expect(repo.startWork(task)).resolves.toBeUndefined();
    await expect(repo.pauseWork(makeTask({ status: "active" }))).resolves.toBeUndefined();
  });
});

describe("automatic review state", () => {
  it("hydrates review activity from the index and updates it through SSE", async () => {
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    const reviewing = makeTask({
      status: "review",
      automaticReview: { running: true, enabled: true },
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health")) return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index")) return json({ tasks: [reviewing], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/review")) return json({ ok: true, running: false, enabled: true, review: null });
      throw new Error("unexpected fetch: " + url);
    }));

    const repo = useRepoStore();
    await repo.init();
    expect(repo.reviewFor("0001")).toMatchObject({ running: true, enabled: true });

    const es = FakeEventSource.instances[0];
    es.emit("review", { type: "review", id: "0001", state: "failed", at: "2026-08-12T00:00:00Z", error: "boom" });
    await Promise.resolve();
    expect(repo.reviewFor("0001")).toMatchObject({ running: false, enabled: true });
  });

  it("rehydrates review activity when SSE reconnects", async () => {
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    const idle = makeTask({ status: "review", automaticReview: { running: false, enabled: true } });
    const running = makeTask({ status: "review", automaticReview: { running: true, enabled: true } });
    let indexReads = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health")) return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index")) return json({ tasks: [indexReads++ === 0 ? idle : running], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/review")) return json({ ok: true, running: false, enabled: true, review: null });
      throw new Error("unexpected fetch: " + url);
    }));

    const repo = useRepoStore();
    await repo.init();
    expect(repo.reviewFor("0001")).toMatchObject({ running: false });
    // The FIRST open is the initial connection — init() fetched the index
    // moments earlier, so it deliberately does not refetch (see repo.ts).
    // A reconnect is the SECOND open, and that is what must rehydrate:
    // events emitted while the stream was down are never replayed.
    FakeEventSource.instances[0].onopen?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(repo.reviewFor("0001")).toMatchObject({ running: false });
    FakeEventSource.instances[0].onopen?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(repo.reviewFor("0001")).toMatchObject({ running: true, enabled: true });
  });

  it("re-fetches the authoritative report for in-review tasks on reconnect (0291)", async () => {
    // Simulate #0291: a review completed but its SSE completion event was
    // dropped during a reload gap, so the card is left showing the previous
    // round's verdict. On reconnect, refresh() must pull the fresh report for
    // tasks still in `review` — no drawer open required.
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    const task = makeTask({ status: "review", automaticReview: { running: false, enabled: true } });
    let report = {
      id: "r2",
      at: "2026-08-24T21:36:00Z",
      agent: "reviewer",
      cli: "opencode",
      model: "default",
      state: "ok" as const,
      markdown: "Verdict: needs some work",
    };
    let reviewReads = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health")) return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/review")) {
        reviewReads++;
        return json({ ok: true, running: false, enabled: true, review: report });
      }
      throw new Error("unexpected fetch: " + url);
    }));

    const repo = useRepoStore();
    await repo.init();
    // The initial connection hydrates the earlier round's verdict.
    await vi.waitFor(() => expect(repo.reviewFor("0001")?.report?.id).toBe("r2"));

    // The authoritative latest round is now "good to go" on the server, but the
    // SSE completion event for it was dropped. Simulate the reconnect: the
    // server now reports the fresh report, and refresh() must pull it in.
    report = {
      id: "r3",
      at: "2026-08-24T21:50:00Z",
      agent: "reviewer",
      cli: "opencode",
      model: "default",
      state: "ok",
      markdown: "Verdict: good to go",
    };
    // The first manual open after init() is the "reusable" one (init() fetched
    // moments ago) and does not refresh; the SECOND is a true reconnect that
    // must refetch the report for the in-review task.
    FakeEventSource.instances[0].onopen?.();
    FakeEventSource.instances[0].onopen?.();
    await vi.waitFor(() => expect(repo.reviewFor("0001")?.report?.id).toBe("r3"));
    expect(repo.reviewFor("0001")?.report?.markdown).toContain("good to go");
    expect(reviewReads).toBeGreaterThanOrEqual(2);
  });
});

describe("reviewer conversation (0110)", () => {
  it("routes reviewer output into its own conversation and sends follow-ups", async () => {
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    const reviewing = makeTask({
      status: "review",
      automaticReview: { running: false, enabled: true },
    });
    const posts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [reviewing], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/review/again")) {
        posts.push("again");
        return json({ ok: true });
      }
      if (url.includes("/review/message")) {
        posts.push("message");
        return json({ ok: true });
      }
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
      throw new Error("unexpected fetch: " + url);
    }));

    const repo = useRepoStore();
    await repo.init();

    // Reviewer output streams under the `review:<id>` event id and lands in the
    // conversation buffer — never in the engineer transcript.
    const es = FakeEventSource.instances[0];
    es.emit("agent.output", {
      type: "agent.output",
      id: "review:0001",
      entry: { type: "text", text: "inspecting the diff…" },
      stream: "out",
    });
    await Promise.resolve();
    expect(repo.reviewFor("0001")?.lines).toContainEqual({
      type: "text",
      text: "inspecting the diff…",
    });
    expect(repo.outputs["0001"]).toBeUndefined();

    await repo.reviewAgain("0001");
    await repo.sendReviewMessage("0001", "why?");
    expect(posts).toEqual(["again", "message"]);
  });
});

describe("CTO board monitor (0174)", () => {
  it("hydrates from /api/cto, streams monitor output, and refreshes on run end", async () => {
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    const report = { markdown: "**2 stuck tasks**", at: "2026-08-12T00:00:00Z" };
    let ctoReads = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/api/cto")) {
        ctoReads++;
        return json({
          ok: true,
          enabled: true,
          running: false,
          report: ctoReads > 1 ? report : null,
          lines: ctoReads > 1 ? [{ s: "out", d: "CTO monitoring complete" }] : [],
        });
      }
      throw new Error("unexpected fetch: " + url);
    }));

    const repo = useRepoStore();
    await repo.init();
    await repo.loadCTO();
    expect(repo.cto.enabled).toBe(true);
    expect(repo.cto.report).toBeNull();

    // Monitor output streams under the `cto:board` id and lands in the CTO
    // conversation buffer — never in a task transcript.
    const es = FakeEventSource.instances[0];
    es.emit("agent.output", {
      type: "agent.output",
      id: "cto:board",
      entry: { s: "out", d: "nudging #0180…" },
      stream: "out",
    });
    await Promise.resolve();
    expect(repo.cto.lines).toContainEqual({ s: "out", d: "nudging #0180…" });
    expect(repo.outputs["cto:board"]).toBeUndefined();

    // A run starting marks it live; a finished run marks it idle and pulls the
    // authoritative report (loadCTO is fire-and-forget, so flush it).
    es.emit("cto", { type: "cto", state: "running", at: "2026-08-12T00:01:00Z" });
    await Promise.resolve();
    expect(repo.cto.running).toBe(true);
    es.emit("cto", { type: "cto", state: "ready", at: "2026-08-12T00:02:00Z" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(repo.cto.running).toBe(false);
    expect(repo.cto.report).toEqual(report);
    expect(repo.cto.lines).toContainEqual({ s: "out", d: "CTO monitoring complete" });
  });
});

describe("preview state", () => {
  it("updates a task's preview on start and clears it on stop", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    es.emit("task.created", { type: "task.created", task: makeTask() });
    es.emit("preview", {
      type: "preview",
      id: "0001",
      preview: { port: 7234, url: "http://127.0.0.1:7234", startedAt: "2026-08-11T00:00:00Z" },
      at: "2026-08-11T00:00:00Z",
    });
    expect(repo.tasks[0].preview?.url).toBe("http://127.0.0.1:7234");
    expect(repo.feed[0].kind).toBe("preview");
    expect(repo.feed[0].msg).toContain("127.0.0.1:7234");

    es.emit("preview", { type: "preview", id: "0001", preview: null, at: "2026-08-11T00:00:00Z" });
    expect(repo.tasks[0].preview).toBeNull();
    expect(repo.feed[0].msg).toContain("preview stopped");
  });

  it("startPreview and stopPreview hit the preview endpoints", async () => {
    const repo = useRepoStore();
    await repo.init();
    const task = makeTask({ status: "review", branch: "feat/x" });
    await expect(
      repo.startPreview(task),
    ).resolves.toEqual({ ok: true, port: 7234, url: "http://127.0.0.1:7234" });
    await expect(repo.stopPreview(task)).resolves.toBeUndefined();
    const start = vi.mocked(fetch).mock.calls.find((c) => String(c[0]).includes("/preview"));
    expect(start).toBeTruthy();
    expect((start![1] as RequestInit).method).toBe("POST");
  });
});

describe("agent output transcript", () => {
  it("appends agent.output entries with the stream kind", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    es.emit("agent.output", {
      type: "agent.output",
      id: "0001",
      stream: "out",
      entry: { s: "out", d: "hello" },
    });
    es.emit("agent.output", {
      type: "agent.output",
      id: "0001",
      stream: "err",
      entry: { s: "err", d: "warn" },
    });
    expect(repo.outputs["0001"]).toEqual([
      { s: "out", d: "hello" },
      { s: "err", d: "warn" },
    ]);
  });

  it("retains structured entries from the opencode JSON stream", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    es.emit("agent.output", {
      type: "agent.output",
      id: "0001",
      stream: "out",
      entry: { type: "text", text: "Let me look." },
    });
    es.emit("agent.output", {
      type: "agent.output",
      id: "0001",
      stream: "out",
      entry: { type: "tool", tool: "bash", input: "ls", output: "total 8", state: "completed" },
    });
    es.emit("agent.output", {
      type: "agent.output",
      id: "0001",
      stream: "out",
      entry: { type: "step", kind: "finish", reason: "stop" },
    });
    expect(repo.outputs["0001"]).toEqual([
      { type: "text", text: "Let me look." },
      { type: "tool", tool: "bash", input: "ls", output: "total 8", state: "completed" },
      { type: "step", kind: "finish", reason: "stop" },
    ]);
  });

  it("adds a sys marker on agent.exited", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    es.emit("agent.output", {
      type: "agent.output",
      id: "0001",
      stream: "out",
      entry: { s: "out", d: "done" },
    });
    es.emit("agent.exited", { type: "agent.exited", id: "0001" });
    const last = repo.outputs["0001"].at(-1) as { s?: string; d: string };
    expect(last.s).toBe("sys");
    expect(last.d).toContain("stopped");
  });

  it("caps the transcript at OUTPUT_MAX_LINES", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    for (let i = 0; i < 2010; i++) {
      es.emit("agent.output", {
        type: "agent.output",
        id: "0001",
        stream: "out",
        entry: { s: "out", d: "x" },
      });
    }
    expect(repo.outputs["0001"].length).toBe(2000);
  });

  it("loadOutput replaces the transcript from the endpoint", async () => {
    const repo = useRepoStore();
    await repo.init();
    await repo.loadOutput("0001");
    expect(repo.outputs["0001"]).toEqual([{ s: "out", d: "resumed transcript" }]);
  });

  it("loadOutput hydrates live stats from the endpoint, not just the transcript", async () => {
    const repo = useRepoStore();
    await repo.init();
    await repo.loadOutput("0001");
    expect(repo.agentStats["0001"]).toEqual({
      accumulatedMs: 4200,
      turnStartedAt: null,
      lastOutputAt: "2026-08-11T00:00:00Z",
      tokens: 150,
      costUsd: 0.02,
      stalled: false,
    });
  });

  it("sendMessage posts the follow-up text", async () => {
    const repo = useRepoStore();
    await repo.init();
    await expect(repo.sendMessage("0001", "keep going")).resolves.toBeUndefined();
    const call = vi.mocked(fetch).mock.calls.find((c) => String(c[0]).includes("/message"));
    expect(call).toBeTruthy();
    const opts = call![1] as RequestInit;
    expect(JSON.parse(opts.body as string)).toEqual({ text: "keep going" });
  });

  it("sendMessage throws when the turn is busy", async () => {
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
      if (url.includes("/api/agents/running"))
        return json({ tasks: [] });
      if (url.includes("/message"))
        return json({ ok: false, reason: "busy" });
      throw new Error("unexpected fetch: " + url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const repo = useRepoStore();
    await repo.init();
    await expect(repo.sendMessage("0001", "go")).rejects.toThrow("busy");
  });
});

describe("agent stats (0080)", () => {
  const STATS = {
    accumulatedMs: 1000,
    turnStartedAt: "2026-08-11T00:00:10Z",
    lastOutputAt: "2026-08-11T00:00:12Z",
    tokens: 88,
    costUsd: 0.01,
    stalled: false,
  };

  it("applies agent.stats events keyed by task id", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    es.emit("agent.stats", { type: "agent.stats", id: "0001", stats: STATS });
    expect(repo.agentStats["0001"]).toEqual(STATS);
  });

  it("surfaces a stall warning distinctly from a normal running state", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    es.emit("agent.stats", { type: "agent.stats", id: "0001", stats: { ...STATS, stalled: true } });
    expect(repo.agentStats["0001"].stalled).toBe(true);

    // New output is evidence of life, not death — clearing must be possible.
    es.emit("agent.stats", { type: "agent.stats", id: "0001", stats: { ...STATS, stalled: false } });
    expect(repo.agentStats["0001"].stalled).toBe(false);
  });
});

describe("error toasts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pushes a dismissible error toast via onError", async () => {
    const repo = useRepoStore();
    await repo.init();
    repo.onError(new Error("something broke"));
    expect(repo.toasts).toHaveLength(1);
    expect(repo.toasts[0].message).toBe("something broke");
    expect(repo.toasts[0].type).toBe("error");

    repo.removeToast(repo.toasts[0].id);
    expect(repo.toasts).toHaveLength(0);
  });

  it("auto-dismisses toasts after ~6s", async () => {
    const repo = useRepoStore();
    await repo.init();
    repo.onError(new Error("timeout test"));
    expect(repo.toasts).toHaveLength(1);
    vi.advanceTimersByTime(6000);
    expect(repo.toasts).toHaveLength(0);
  });

  it("suppresses duplicate toasts within the dedup window", async () => {
    const repo = useRepoStore();
    await repo.init();
    repo.onError(new Error("dup"));
    repo.onError(new Error("dup"));
    expect(repo.toasts).toHaveLength(1);
  });

  it("pushes a toast when a mutation returns !ok", async () => {
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
      if (url.includes("/api/agents/running"))
        return json({ tasks: [] });
      if (url.includes("/start"))
        return json({ ok: false, reason: "agent unavailable" });
      throw new Error("unexpected fetch: " + url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const repo = useRepoStore();
    await repo.init();
    await expect(repo.startWork(makeTask({ status: "ready" }))).rejects.toThrow("agent unavailable");
    expect(repo.toasts.some((t) => t.message === "agent unavailable")).toBe(true);
  });
});

describe("parked build reconciliation (0179)", () => {
  it("surfaces a parked build on page load without any prior build.available event", async () => {
    localStorage.removeItem("repoos.newVersion");
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    const parkedHealth = {
      ok: true,
      root: "/tmp/repo",
      taskCount: 0,
      workDir: "work",
      buildAt: "2026-08-01T00:00:00.000Z",
      buildHash: "hash-running",
      buildAvailableHash: "hash-parked",
      buildAvailableAt: "2026-08-13T00:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health")) return json(parkedHealth);
        if (url.includes("/api/board") || url.includes("/api/index"))
          return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        throw new Error("unexpected fetch: " + url);
      }),
    );

    const repo = useRepoStore();
    await repo.init();
    await vi.waitFor(() => expect(repo.newVersion).toBeTruthy());
    expect(repo.newVersion).toEqual({
      hash: "hash-parked",
      buildAt: "2026-08-13T00:00:00.000Z",
    });
  });

  it("sets the notice on SSE reconnect when a build parked while the tab was closed", async () => {
    localStorage.removeItem("repoos.newVersion");
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    let parked = false;
    const health = () => ({
      ok: true,
      root: "/tmp/repo",
      taskCount: 0,
      workDir: "work",
      buildAt: "2026-08-01T00:00:00.000Z",
      buildHash: "hash-running",
      buildAvailableHash: parked ? "hash-parked" : null,
      buildAvailableAt: parked ? "2026-08-13T00:00:00.000Z" : null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health")) return json(health());
        if (url.includes("/api/board") || url.includes("/api/index"))
          return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        throw new Error("unexpected fetch: " + url);
      }),
    );

    const repo = useRepoStore();
    await repo.init();
    await Promise.resolve();
    expect(repo.newVersion).toBeNull();

    // A build lands and is parked while the tab is disconnected — hello on
    // reconnect must surface it even though no build.available event was seen.
    parked = true;
    FakeEventSource.instances[0].emit("hello", {
      type: "hello",
      taskCount: 0,
      at: "2026-08-13T01:00:00.000Z",
    });
    await vi.waitFor(() => expect(repo.newVersion).toBeTruthy());
    expect(repo.newVersion).toEqual({
      hash: "hash-parked",
      buildAt: "2026-08-13T00:00:00.000Z",
    });
  });

  it("clears the notice once the running server serves the parked build (reload landed)", async () => {
    localStorage.removeItem("repoos.newVersion");
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    let reloaded = false;
    const health = () => ({
      ok: true,
      root: "/tmp/repo",
      taskCount: 0,
      workDir: "work",
      buildAt: reloaded ? "2026-08-13T00:00:00.000Z" : "2026-08-01T00:00:00.000Z",
      buildHash: reloaded ? "hash-parked" : "hash-running",
      buildAvailableHash: reloaded ? null : "hash-parked",
      buildAvailableAt: reloaded ? null : "2026-08-13T00:00:00.000Z",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health")) return json(health());
        if (url.includes("/api/board") || url.includes("/api/index"))
          return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        throw new Error("unexpected fetch: " + url);
      }),
    );

    const repo = useRepoStore();
    await repo.init();
    await vi.waitFor(() =>
      expect(repo.newVersion).toEqual({
        hash: "hash-parked",
        buildAt: "2026-08-13T00:00:00.000Z",
      }),
    );

    // The reload landed: the running server now serves the parked build and
    // reports nothing parked. hello reconciles the persisted notice away.
    reloaded = true;
    FakeEventSource.instances[0].emit("hello", {
      type: "hello",
      taskCount: 0,
      at: "2026-08-13T02:00:00.000Z",
    });
    await vi.waitFor(() => expect(repo.newVersion).toBeNull());
  });
});

describe("default drawer tab (0080)", () => {
  it("opens on the Agent tab for an active task — that's where the live action is", () => {
    const ui = useUiStore();
    ui.open(makeTask({ status: "active" }));
    expect(ui.activeTab).toBe("agent");
  });

  it("opens on the Agent Review tab for a review task (0110)", () => {
    const ui = useUiStore();
    ui.open(makeTask({ status: "review" }));
    expect(ui.activeTab).toBe("review");
  });

  it.each(["draft", "inbox", "ready", "done"] as const)(
    "opens on the Details tab for a %s task",
    (status) => {
      const ui = useUiStore();
      ui.open(makeTask({ status }));
      expect(ui.activeTab).toBe("details");
    },
  );

  it("openTask applies the same status-based default (fetch-refresh path)", async () => {
    const ui = useUiStore();
    // The shared fetch mock has no handler for a bare GET /api/tasks/:id, so
    // openTask falls back to its already-known task — the default-tab logic
    // must still apply on that fallback path, not only on the happy path.
    await ui.openTask(makeTask({ status: "active" }));
    expect(ui.activeTab).toBe("agent");
  });

  it("close() resets to details as a safe baseline for the next open", () => {
    const ui = useUiStore();
    ui.open(makeTask({ status: "active" }));
    expect(ui.activeTab).toBe("agent");
    ui.close();
    expect(ui.activeTab).toBe("details");
  });
});

describe("background task updates keep the drawer's tab (0312)", () => {
  it("task.updated syncs the drawer's copy without resetting the active tab", async () => {
    const repo = useRepoStore();
    await repo.init();
    const ui = useUiStore();
    const es = FakeEventSource.instances[0];
    // An active task opens on the Agent tab; the user then moves to the PM tab.
    ui.open(makeTask({ status: "active" }));
    ui.activeTab = "pm";
    expect(ui.activeTab).toBe("pm");
    // The debounced agent+model override save lands as an SSE task.updated.
    es.emit("task.updated", {
      type: "task.updated",
      task: makeTask({ status: "active", modelOverride: "deepinfra/some-model" }),
      prev: { modelOverride: null },
    });
    expect(ui.activeTab).toBe("pm");
    expect(ui.active?.modelOverride).toBe("deepinfra/some-model");
  });

  it("task.updated does not bounce a review-status task off the Agent tab", async () => {
    const repo = useRepoStore();
    await repo.init();
    const ui = useUiStore();
    const es = FakeEventSource.instances[0];
    // A review task opens on the Agent Review tab; the user moves to Agent.
    ui.open(makeTask({ status: "review" }));
    ui.activeTab = "agent";
    es.emit("task.updated", {
      type: "task.updated",
      task: makeTask({ status: "review", modelOverride: "deepinfra/some-model" }),
      prev: { modelOverride: null },
    });
    expect(ui.activeTab).toBe("agent");
  });

  it("preview events update the drawer's preview without resetting the active tab", async () => {
    const repo = useRepoStore();
    await repo.init();
    const ui = useUiStore();
    const es = FakeEventSource.instances[0];
    es.emit("task.created", { type: "task.created", task: makeTask({ status: "active" }) });
    ui.open(makeTask({ status: "active" }));
    ui.activeTab = "pm";
    es.emit("preview", {
      type: "preview",
      id: "0001",
      preview: { url: "http://127.0.0.1:7234", port: 7234, startedAt: "2026-08-27T00:00:00Z" },
      at: "2026-08-27T00:00:00Z",
    });
    expect(ui.activeTab).toBe("pm");
    expect(ui.active?.preview?.url).toBe("http://127.0.0.1:7234");
  });
});

describe("fresh-done acknowledgement (0278)", () => {
  const now = () => new Date().toISOString();

  it("flags a task that transitions review->done, and clears it on acknowledge", async () => {
    localStorage.removeItem("repoos.done.acked");
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    es.emit("task.created", { type: "task.created", task: makeTask() });
    expect(repo.needsAck(repo.tasks[0])).toBe(false);
    es.emit("task.updated", {
      type: "task.updated",
      task: makeTask({ status: "done", updated_at: now() }),
      prev: { status: "review" },
    });
    expect(repo.tasks[0].status).toBe("done");
    expect(repo.needsAck(repo.tasks[0])).toBe(true);
    expect(repo.doneAckCount).toBe(1);
    repo.acknowledge("0001");
    expect(repo.needsAck(repo.tasks[0])).toBe(false);
    expect(repo.doneAckCount).toBe(0);
  });

  it("does not flag non-done statuses or tasks updated outside the window", async () => {
    localStorage.removeItem("repoos.done.acked");
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    // A done task updated >24h ago (archive/history) must NOT flag.
    es.emit("task.created", { type: "task.created", task: makeTask({ status: "done", updated_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() }) });
    expect(repo.needsAck(repo.tasks[0])).toBe(false);
    // An active task, however recent, must NOT flag.
    es.emit("task.updated", {
      type: "task.updated",
      task: makeTask({ status: "active", updated_at: now() }),
      prev: { status: "ready" },
    });
    expect(repo.needsAck(repo.tasks[0])).toBe(false);
    expect(repo.doneAckCount).toBe(0);
  });

  it("flags a recently-done task on initial load but persists the ack across reloads", async () => {
    localStorage.removeItem("repoos.done.acked");
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    const recentlyDone = makeTask({ status: "done", updated_at: new Date(Date.now() - 60 * 1000).toISOString() });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health")) return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/board")) return json({ tasks: [recentlyDone], counts: { ...EMPTY_COUNTS, done: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      throw new Error("unexpected fetch: " + url);
    }));

    const repo = useRepoStore();
    await repo.init();
    // First load: the freshly-done task flags.
    expect(repo.needsAck(repo.tasks[0])).toBe(true);
    repo.acknowledge("0001");

    // Reload (a fresh store) reads the persisted ack: stays cleared.
    setActivePinia(createPinia());
    const repo2 = useRepoStore();
    await repo2.init();
    expect(repo2.needsAck(repo2.tasks[0])).toBe(false);
    expect(localStorage.getItem("repoos.done.acked")).toContain("0001");
  });
});

describe("AI-created card acknowledgement (0320)", () => {
  const PENDING_KEY = "repoos.aiCreate.pending";
  const UNACKED_KEY = "repoos.aiCreate.unacked";

  function stubFetchWith(freeformResponse: Record<string, unknown>, boardTasks: Task[] = []): void {
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: boardTasks.length, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: boardTasks, counts: EMPTY_COUNTS, taskCount: boardTasks.length });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/api/tasks/freeform")) return json(freeformResponse);
      throw new Error("unexpected fetch: " + url);
    }));
  }

  it("flags the card when the PM flesh-out lands, and clears it on acknowledge", async () => {
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(UNACKED_KEY);
    stubFetchWith({ ok: true, fallback: false, task: makeTask({ id: "0043", status: "draft" }) });
    const repo = useRepoStore();
    await repo.init();

    // The freeform create marks the draft pending; no highlight while the PM
    // agent is still fleshing it out.
    await repo.createFreeformTask("a fresh idea", "run-1");
    expect(repo.aiCreatePending.has("0043")).toBe(true);
    expect(repo.needsCreateAck("0043")).toBe(false);

    // The flesh-out lands as a draft -> default-status transition.
    const es = FakeEventSource.instances[0];
    es.emit("task.updated", {
      type: "task.updated",
      task: makeTask({ id: "0043", status: "inbox", title: "Fleshed out" }),
      prev: { status: "draft", title: "a fresh idea" },
    });
    expect(repo.aiCreatePending.has("0043")).toBe(false);
    expect(repo.needsCreateAck("0043")).toBe(true);

    repo.acknowledgeCreate("0043");
    expect(repo.needsCreateAck("0043")).toBe(false);
  });

  it("never flags fallback creations or tasks not created through the AI flow", async () => {
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(UNACKED_KEY);
    const draft = makeTask({ id: "0044", status: "draft" });
    stubFetchWith({ ok: true, fallback: true, fallbackReason: "no-pm-agent", task: draft });
    const repo = useRepoStore();
    await repo.init();

    // no-pm-agent fallback: nothing will flesh the draft out, so it must not
    // be marked pending and its later transition must not flag.
    await repo.createFreeformTask("rough idea", "run-2");
    expect(repo.aiCreatePending.has("0044")).toBe(false);
    const es = FakeEventSource.instances[0];
    es.emit("task.updated", {
      type: "task.updated",
      task: makeTask({ id: "0044", status: "inbox" }),
      prev: { status: "draft" },
    });
    expect(repo.needsCreateAck("0044")).toBe(false);

    // A manually created task (never marked) transitioning draft -> inbox.
    es.emit("task.created", { type: "task.created", task: makeTask({ id: "0045", status: "draft" }) });
    es.emit("task.updated", {
      type: "task.updated",
      task: makeTask({ id: "0045", status: "inbox" }),
      prev: { status: "draft" },
    });
    expect(repo.needsCreateAck("0045")).toBe(false);
  });

  it("persists the highlight across reloads until acknowledged", async () => {
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(UNACKED_KEY);
    stubFetchWith({ ok: true, fallback: false, task: makeTask({ id: "0043", status: "draft" }) });
    const repo = useRepoStore();
    await repo.init();
    await repo.createFreeformTask("a fresh idea", "run-1");
    FakeEventSource.instances[0].emit("task.updated", {
      type: "task.updated",
      task: makeTask({ id: "0043", status: "inbox" }),
      prev: { status: "draft" },
    });
    expect(repo.needsCreateAck("0043")).toBe(true);

    // Reload (a fresh store): the persisted unacked id keeps the highlight.
    setActivePinia(createPinia());
    const repo2 = useRepoStore();
    await repo2.init();
    expect(repo2.needsCreateAck("0043")).toBe(true);
    expect(localStorage.getItem(UNACKED_KEY)).toContain("0043");

    repo2.acknowledgeCreate("0043");
    // Another reload: the ack persisted, the highlight stays cleared.
    setActivePinia(createPinia());
    const repo3 = useRepoStore();
    await repo3.init();
    expect(repo3.needsCreateAck("0043")).toBe(false);
  });

  it("recovers a missed SSE transition on load: pending ids already off draft flag, drafts stay pending", async () => {
    // The tab was closed while the PM agent ran; on reload the board shows
    // #0046 already promoted while #0047 is still a draft, and #0048 was
    // deleted while pending.
    localStorage.setItem(PENDING_KEY, JSON.stringify(["0046", "0047", "0048"]));
    localStorage.removeItem(UNACKED_KEY);
    stubFetchWith({ ok: true, fallback: false, task: makeTask() }, [
      makeTask({ id: "0046", status: "inbox" }),
      makeTask({ id: "0047", status: "draft" }),
    ]);
    const repo = useRepoStore();
    await repo.init();

    expect(repo.needsCreateAck("0046")).toBe(true);
    expect(repo.needsCreateAck("0047")).toBe(false);
    expect(repo.aiCreatePending.has("0047")).toBe(true);
    expect(repo.aiCreatePending.has("0048")).toBe(false);
  });
});

describe("sync task branch with main (rebase-onto-main button)", () => {
  it("posts to /sync, reloads diff data, and toasts success", async () => {
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    const posts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/sync")) {
        posts.push("sync");
        return json({ ok: true });
      }
      if (url.includes("/diff-stats"))
        return json({ ok: true, stats: { filesChanged: 3, additions: 10, deletions: 2 } });
      if (url.includes("/diff"))
        return json({ ok: true, diff: { patch: "diff --git a b", truncated: false } });
      throw new Error("unexpected fetch: " + url);
    }));

    const repo = useRepoStore();
    await repo.init();
    await repo.syncTaskBranch("0253");

    expect(posts).toEqual(["sync"]);
    expect(repo.diffStatsFor("0253")).toEqual({ filesChanged: 3, additions: 10, deletions: 2 });
    expect(repo.diffFor("0253")).toEqual({ patch: "diff --git a b", truncated: false });
    expect(repo.toasts.some((t) => t.message === "Synced with main" && t.type === "success")).toBe(true);
  });

  it("toasts the conflicting files and rethrows on failure", async () => {
    const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/sync"))
        return json({ ok: false, conflicts: ["src/foo.ts", "src/bar.ts"] });
      throw new Error("unexpected fetch: " + url);
    }));

    const repo = useRepoStore();
    await repo.init();
    await expect(repo.syncTaskBranch("0253")).rejects.toThrow("src/foo.ts, src/bar.ts");
    expect(repo.toasts.some((t) => t.type === "error" && t.message.includes("src/foo.ts"))).toBe(true);
  });
});
