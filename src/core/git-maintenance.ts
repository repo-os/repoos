import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { gitOutputAsync } from "./git.js";

const TICK_MS = 5 * 60_000;
const INDEX_LOCK_TICK_MS = 60_000;
const MAX_GRAPH_AGE_MS = 60 * 60_000;
const DEBOUNCE_MS = 5_000;
const STALE_INDEX_LOCK_MS = 2 * 60_000;

export interface GitLockMaintenanceOptions {
  now?: () => number;
  processHasLockOpen?: (path: string) => boolean | Promise<boolean>;
  onLock?: (event: { path: string; state: "live" | "removed"; ageMs: number }) => void;
}

let lockEventSink: GitLockMaintenanceOptions["onLock"] = undefined;

export function setGitMaintenanceLockSink(sink: GitLockMaintenanceOptions["onLock"]): void {
  lockEventSink = sink;
}

function processHasLockOpen(path: string): boolean {
  try {
    return (
      execFileSync("lsof", ["-t", path], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim().length > 0
    );
  } catch (error) {
    // lsof exits 1 when no process has the file open. If the probe itself is
    // unavailable, fail safe and leave the lock for a later maintenance tick.
    return (error as { status?: number }).status !== 1;
  }
}

/** Independent of both worker queues: a history timeout cannot cancel maintenance. */
export class CommitGraphMaintenance {
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private tick: ReturnType<typeof setInterval>;
  private lockTick: ReturnType<typeof setInterval>;
  private running: Promise<void> | null = null;
  private closed = false;

  constructor(
    private readonly root: string,
    private readonly git: typeof gitOutputAsync = gitOutputAsync,
    private readonly warn: (message: string) => void = console.warn,
    private readonly lockOptions: GitLockMaintenanceOptions = {},
  ) {
    this.tick = setInterval(() => void this.check(), TICK_MS);
    this.tick.unref?.();
    this.lockTick = setInterval(() => void this.checkIndexLocks(), INDEX_LOCK_TICK_MS);
    this.lockTick.unref?.();
    this.schedule(0);
  }

  schedule(delayMs = DEBOUNCE_MS): void {
    if (this.closed) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = undefined;
      void this.check();
    }, delayMs);
    this.debounce.unref?.();
  }

  check(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.rebuildIfNeeded()
      .catch((error) => {
        this.warn(`git commit-graph maintenance failed: ${(error as Error).message}`);
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  private async rebuildIfNeeded(): Promise<void> {
    await this.recoverIndexLocks();
    const head = await this.git(this.root, ["rev-parse", "HEAD"]);
    if (!head || this.closed) return;
    const objects = await this.git(this.root, ["rev-parse", "--git-path", "objects"]);
    if (!objects || this.closed) return;
    const info = resolve(this.root, objects, "info");
    const graphs = await Promise.all([
      stat(join(info, "commit-graph")).catch(() => null),
      stat(join(info, "commit-graphs", "commit-graph-chain")).catch(() => null),
    ]);
    const graphTime = Math.max(...graphs.map((entry) => entry?.mtimeMs ?? 0));
    // Keep graph bookkeeping beside Git's graph, shared by linked worktrees.
    const stamp = join(info, "repoos-commit-graph.json");
    let previous: { head?: string; writtenAt?: number } = {};
    try {
      previous = JSON.parse(await readFile(stamp, "utf8"));
    } catch {
      /* missing/corrupt */
    }
    if (
      graphTime &&
      previous?.head === head &&
      typeof previous.writtenAt === "number" &&
      Date.now() - Math.min(graphTime, previous.writtenAt) < MAX_GRAPH_AGE_MS
    )
      return;
    if (this.closed) return;
    const result = await this.git(
      this.root,
      ["commit-graph", "write", "--reachable", "--changed-paths", "--split"],
      120_000,
    );
    if (result === null) throw new Error("git commit-graph write failed (will retry on next tick)");
    const temporary = `${stamp}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(stamp), { recursive: true });
      await writeFile(temporary, JSON.stringify({ head, writtenAt: Date.now() }));
      await rename(temporary, stamp);
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }

  private async recoverIndexLocks(): Promise<void> {
    const now = this.lockOptions.now ?? Date.now;
    const listed = await this.git(this.root, ["worktree", "list", "--porcelain"]);
    const roots = new Set([this.root]);
    for (const line of (listed ?? "").split("\n")) {
      if (line.startsWith("worktree ")) roots.add(line.slice("worktree ".length).trim());
    }
    for (const root of roots) {
      if (this.closed) return;
      const gitDir = await this.git(root, ["rev-parse", "--absolute-git-dir"]);
      if (!gitDir) continue;
      const path = join(gitDir, "index.lock");
      const lock = await stat(path).catch(() => null);
      if (!lock) continue;
      const ageMs = Math.max(0, now() - lock.mtimeMs);
      if (ageMs <= STALE_INDEX_LOCK_MS) continue;
      let live = true;
      try {
        live = await (this.lockOptions.processHasLockOpen ?? processHasLockOpen)(path);
      } catch {
        live = true;
      }
      if (live) {
        (this.lockOptions.onLock ?? lockEventSink)?.({ path, state: "live", ageMs });
        continue;
      }
      await rm(path, { force: true });
      (this.lockOptions.onLock ?? lockEventSink)?.({ path, state: "removed", ageMs });
    }
  }

  private async checkIndexLocks(): Promise<void> {
    if (this.closed) return;
    try {
      await this.recoverIndexLocks();
    } catch (error) {
      this.warn(`git index.lock maintenance failed: ${(error as Error).message}`);
    }
  }

  close(): void {
    this.closed = true;
    clearInterval(this.tick);
    clearInterval(this.lockTick);
    clearTimeout(this.debounce);
  }
}
