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
function worker() {
  const instance = new GitWorker("/tmp", launch as unknown as typeof spawn);
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
  baseBranch: "main",
  branches: ["main"],
  heads: [["main", "old"]],
  aheadCounts: [],
  worktrees: [],
  fingerprint: "old",
};

describe("Git worker lifecycle", () => {
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
