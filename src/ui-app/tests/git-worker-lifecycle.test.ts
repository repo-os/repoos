import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { spawn } from "node:child_process";
import { GitWorker } from "../../server/git-worker.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

function child() {
  return Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    unref: vi.fn(),
    kill: vi.fn(),
  });
}

const workers: GitWorker[] = [];
const launch = vi.fn<typeof spawn>();
function worker(queueWaitMs?: number) {
  const instance = new GitWorker("/tmp", launch as unknown as typeof spawn, queueWaitMs);
  workers.push(instance);
  return instance;
}

afterEach(() => {
  for (const instance of workers.splice(0)) instance.close();
  vi.restoreAllMocks();
  launch.mockReset();
  vi.useRealTimers();
});

const overview = {
  useGit: true,
  head: "old",
  baseBranch: "main",
  branches: ["main"],
  heads: [["main", "old"]],
  aheadCounts: [],
  mergedBranches: [],
  worktrees: [],
  fingerprint: "old",
};

describe("Git worker lifecycle", () => {
  it("expires a request that waits too long in the queue without interrupting the running one", async () => {
    vi.useFakeTimers();
    const process = child();
    launch.mockReturnValue(process as never);
    const instance = worker(50);
    const running = instance.request("running", {}, 1_000);
    const expired = instance.request("queued", {}, 10).catch((error: Error) => error.message);
    const next = instance.request("next", {}, 1_000).catch((error: Error) => error.message);

    expect(instance.inFlight().map(({ state }) => state)).toEqual(["running", "queued", "queued"]);
    await vi.advanceTimersByTimeAsync(25);
    expect(instance.inFlight()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: "queued", queueWaitMs: 25, runMs: 0 }),
      ]),
    );
    await vi.advanceTimersByTimeAsync(25);
    expect(await expired).toContain("queued waited 50ms in the queue without starting");
    expect(process.kill).not.toHaveBeenCalled();
    expect(launch).toHaveBeenCalledTimes(1);
    expect(instance.inFlight().map(({ id }) => id)).toEqual([1]);

    process.stdout.emit("data", JSON.stringify({ id: 1, ok: true, value: "first" }) + "\n");
    await expect(running).resolves.toBe("first");
    expect(await next).toContain("waited 50ms in the queue");
    expect(instance.inFlight()).toEqual([]);
  });

  it("starts a request's own timeout when it runs, not while it waits behind a slow call", async () => {
    vi.useFakeTimers();
    const process = child();
    launch.mockReturnValue(process as never);
    const instance = worker(60_000);
    const slow = instance.request("first-bulk", {}, 30_000);
    const quick = instance.request("second-bulk", {}, 9_000);

    // The slow scan takes 20 s: longer than the quick command's 9 s budget.
    await vi.advanceTimersByTimeAsync(20_000);
    process.stdout.emit("data", JSON.stringify({ id: 1, ok: true, value: "scan" }) + "\n");
    await expect(slow).resolves.toBe("scan");
    expect(instance.inFlight().map(({ id, state }) => ({ id, state }))).toEqual([
      { id: 2, state: "running" },
    ]);
    await vi.advanceTimersByTimeAsync(1_000);
    process.stdout.emit("data", JSON.stringify({ id: 2, ok: true, value: "done" }) + "\n");
    await expect(quick).resolves.toBe("done");
  });

  it.each(
    ["git-overview", "build-index", "task-facts", "dependency-blockers"].flatMap((kind) =>
      ["git-command", "run-git", "worktree-path", "changed-paths"].map((quickKind) => [
        kind,
        quickKind,
      ]),
    ),
  )("%s cannot block %s, and its timeout cannot kill the fast lane", async (kind, quickKind) => {
    vi.useFakeTimers();
    const bulk = child();
    const fast = child();
    launch.mockReturnValueOnce(bulk as never).mockReturnValueOnce(fast as never);
    const instance = worker();
    const slow = instance.request(kind, {}, 100).catch((error: Error) => error.message);
    const quick = instance.request(quickKind, {}, 1_000);
    await vi.advanceTimersByTimeAsync(25);
    expect(instance.inFlight()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lane: "bulk", runMs: 25, queueWaitMs: 0 }),
        expect.objectContaining({ lane: "fast", runMs: 25, queueWaitMs: 0 }),
      ]),
    );
    fast.stdout.emit("data", JSON.stringify({ id: 1, ok: true, value: "quick" }) + "\n");
    await expect(quick).resolves.toBe("quick");
    const next = instance.request("git-command", {}, 1_000);
    await vi.advanceTimersByTimeAsync(75);
    expect(await slow).toContain("timed out");
    expect(fast.kill).not.toHaveBeenCalled();
    fast.stdout.emit("data", JSON.stringify({ id: 2, ok: true, value: "alive" }) + "\n");
    await expect(next).resolves.toBe("alive");
  });

  it.each(["close", "error", "data"])("ignores a replaced child's late %s event", async (event) => {
    vi.useFakeTimers();
    const old = child();
    const replacement = child();
    launch.mockReturnValueOnce(old as never).mockReturnValueOnce(replacement as never);
    const instance = worker();
    const expired = instance.request("first", {}, 10).catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(10);
    expect(await expired).toContain("timed out");
    const next = instance.request("second", {});
    if (event === "data") old.stdout.emit("data", "invalid JSON\n");
    else if (event === "error") old.emit("error", new Error("late error"));
    else old.emit("close", null, "SIGKILL");
    replacement.stdout.emit("data", JSON.stringify({ id: 2, ok: true, value: "fresh" }) + "\n");
    await expect(next).resolves.toBe("fresh");
  });

  it.each(["gitOverview", "buildIndex", "dependencyBlockers"] as const)(
    "does not repopulate %s's cache after invalidation during a read",
    async (method) => {
      const instance = worker();
      let finish!: (value: unknown) => void;
      const request = vi.spyOn(instance, "request").mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const tasks = [{ id: "1", dependsOn: ["2"] }] as Task[];
      const read = () =>
        method === "gitOverview"
          ? instance.gitOverview()
          : method === "buildIndex"
            ? instance.buildIndex({ root: "/tmp" } as RepoOSConfig, true)
            : instance.dependencyBlockers("/tmp", tasks);
      const pending = read();
      instance.invalidate();
      finish(
        method === "gitOverview"
          ? overview
          : method === "buildIndex"
            ? { index: {}, git: overview }
            : [],
      );
      await pending;
      request.mockResolvedValue(
        method === "gitOverview"
          ? overview
          : method === "buildIndex"
            ? { index: {}, git: overview }
            : [],
      );
      if (method === "buildIndex") await instance.gitOverview();
      else await read();
      expect(request).toHaveBeenCalledTimes(2);
    },
  );

  it("carries invalidation on the next request instead of a separately expiring job", async () => {
    const process = child();
    launch.mockReturnValue(process as never);
    const instance = worker();
    const first = instance.request("first", {});
    const queued = instance.request("second", {});
    instance.invalidate();
    process.stdout.emit("data", JSON.stringify({ id: 1, ok: true, value: null }) + "\n");
    // A stream read may return one write at a time (notably under Bun).
    // Drain all available chunks without assuming how writes are coalesced.
    const chunks: string[] = [];
    for (let chunk = process.stdin.read(); chunk !== null; chunk = process.stdin.read()) {
      chunks.push(chunk.toString());
    }
    const lines = chunks
      .join("")
      .trim()
      .split("\n")
      .map((line: string) => JSON.parse(line));
    expect(lines.map((line: { generation: number }) => line.generation)).toEqual([0, 1]);
    process.stdout.emit("data", JSON.stringify({ id: 2, ok: true, value: null }) + "\n");
    await Promise.all([first, queued]);
  });
});
