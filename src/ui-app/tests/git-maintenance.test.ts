import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  utimesSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommitGraphMaintenance } from "../../core/git-maintenance.js";
import { commitTaskFile, setGitLockFailureSink } from "../../core/git.js";

const roots: string[] = [];
const jobs: CommitGraphMaintenance[] = [];
function gitSync(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}
afterEach(() => {
  for (const job of jobs.splice(0)) job.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.useRealTimers();
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "repoos-graph-"));
  roots.push(root);
  const graph = join(root, ".git/objects/info/commit-graphs/commit-graph-chain");
  let head = "first";
  let fail = false;
  const git = vi.fn(async (_root: string, args: string[]) => {
    if (args[0] === "worktree" && args[1] === "list") return "";
    if (args[0] === "rev-parse" && args[1] === "--absolute-git-dir") return join(root, ".git");
    if (args.join(" ") === "rev-parse HEAD") return head;
    if (args.includes("--git-path")) return ".git/objects";
    if (fail) return null;
    mkdirSync(join(root, ".git/objects/info/commit-graphs"), { recursive: true });
    writeFileSync(graph, "chain");
    return "";
  });
  const warn = vi.fn();
  const job = new CommitGraphMaintenance(root, git, warn);
  jobs.push(job);
  return {
    root,
    graph,
    git,
    job,
    warn,
    moveHead: () => {
      head = "second";
    },
    fail: () => {
      fail = true;
    },
  };
}

describe("commit-graph maintenance", () => {
  it("removes stale index locks and keeps locks held by a live git process", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-lock-"));
    roots.push(root);
    mkdirSync(join(root, ".git"), { recursive: true });
    const lock = join(root, ".git", "index.lock");
    writeFileSync(lock, "");
    const old = new Date(1_000);
    utimesSync(lock, old, old);
    const git = vi.fn(async (_repo: string, args: string[]) => {
      if (args[0] === "worktree") return `worktree ${root}`;
      if (args[0] === "rev-parse" && args[1] === "--absolute-git-dir") return join(root, ".git");
      return null;
    });
    const now = () => 200_000;
    const onLock = vi.fn();
    const stale = new CommitGraphMaintenance(root, git, vi.fn(), {
      now,
      processHasLockOpen: () => false,
      onLock,
    });
    jobs.push(stale);
    await stale.check();
    expect(existsSync(lock)).toBe(false);
    expect(onLock).toHaveBeenCalledWith(expect.objectContaining({ state: "removed" }));

    writeFileSync(lock, "");
    utimesSync(lock, old, old);
    const live = new CommitGraphMaintenance(root, git, vi.fn(), {
      now,
      processHasLockOpen: () => true,
      onLock,
    });
    jobs.push(live);
    await live.check();
    expect(existsSync(lock)).toBe(true);
    expect(onLock).toHaveBeenCalledWith(expect.objectContaining({ state: "live" }));
  });

  it("surfaces fail-soft task-file commits blocked by index.lock", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-commit-lock-"));
    roots.push(root);
    gitSync(root, ["init", "-q"]);
    gitSync(root, ["config", "user.email", "test@example.com"]);
    gitSync(root, ["config", "user.name", "Test"]);
    const file = join(root, "task.md");
    writeFileSync(file, "task\n");
    writeFileSync(join(root, ".git", "index.lock"), "");
    const sink = vi.fn();
    setGitLockFailureSink(sink);
    try {
      expect(commitTaskFile(root, file, "docs(0978): test lock handling")).toBe(false);
      expect(sink).toHaveBeenCalledWith(
        root,
        "docs(0978): test lock handling",
        expect.stringMatching(/index\.lock/),
      );
    } finally {
      setGitLockFailureSink(null);
    }
  });
  it("rebuilds missing/stale graphs and changed HEADs, but skips fresh graphs", async () => {
    const f = fixture();
    await f.job.check();
    const writes = () => f.git.mock.calls.filter(([, args]) => args[0] === "commit-graph");
    expect(writes().map(([, args]) => args)).toEqual([
      ["commit-graph", "write", "--reachable", "--changed-paths", "--split"],
    ]);
    await f.job.check();
    expect(writes()).toHaveLength(1);
    f.moveHead();
    await f.job.check();
    expect(writes()).toHaveLength(2);
    const old = new Date(Date.now() - 2 * 60 * 60_000);
    utimesSync(f.graph, old, old);
    await f.job.check();
    expect(writes()).toHaveLength(3);
    rmSync(f.graph);
    await f.job.check();
    expect(writes()).toHaveLength(4);
    expect(
      JSON.parse(readFileSync(join(f.root, ".git/objects/info/repoos-commit-graph.json"), "utf8"))
        .head,
    ).toBe("second");
  });

  it("debounces commits and coalesces concurrent checks", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.job.schedule();
    f.job.schedule();
    f.job.schedule();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(f.git).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await f.job.check();
    expect(f.git.mock.calls.filter(([, args]) => args[0] === "commit-graph")).toHaveLength(1);
    const first = f.job.check();
    expect(f.job.check()).toBe(first);
    await first;
  });

  it("reuses freshness across restarts and retries on the periodic tick", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.job.check();
    f.job.close();
    const restarted = new CommitGraphMaintenance(f.root, f.git, f.warn);
    jobs.push(restarted);
    await restarted.check();
    expect(f.git.mock.calls.filter(([, args]) => args[0] === "commit-graph")).toHaveLength(1);
    f.moveHead();
    // Do not send a mutation signal: the periodic check must catch it too.
    restarted.schedule(10 * 60_000);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await restarted.check();
    expect(f.git.mock.calls.filter(([, args]) => args[0] === "commit-graph")).toHaveLength(2);
    restarted.close();
    const count = f.git.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(f.git).toHaveBeenCalledTimes(count);
  });

  it("retries failed maintenance on a later tick without failing callers", async () => {
    const f = fixture();
    f.fail();
    await expect(f.job.check()).resolves.toBeUndefined();
    await f.job.check();
    expect(f.warn).toHaveBeenCalledTimes(2);
    f.job.close();
    const count = f.git.mock.calls.length;
    await f.job.check();
    expect(f.git).toHaveBeenCalledTimes(count);
  });
});
