import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { gitOutputAsync } from "./git.js";

const TICK_MS = 5 * 60_000;
const MAX_GRAPH_AGE_MS = 60 * 60_000;
const DEBOUNCE_MS = 5_000;

/** Independent of both worker queues: a history timeout cannot cancel maintenance. */
export class CommitGraphMaintenance {
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private tick: ReturnType<typeof setInterval>;
  private running: Promise<void> | null = null;
  private closed = false;

  constructor(
    private readonly root: string,
    private readonly git: typeof gitOutputAsync = gitOutputAsync,
    private readonly warn: (message: string) => void = console.warn,
  ) {
    this.tick = setInterval(() => void this.check(), TICK_MS);
    this.tick.unref?.();
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

  close(): void {
    this.closed = true;
    clearInterval(this.tick);
    clearTimeout(this.debounce);
  }
}
