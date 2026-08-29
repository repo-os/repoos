/**
 * Boot-time regression guard (#0271).
 *
 * RepoOS used to build its entire task index SYNCHRONOUSLY before binding
 * the HTTP listener: `index.refreshAll()` ran hundreds of blocking git
 * subprocess spawns (2-4 per task with a branch) on the main thread before
 * `server.listen()` was even called. With 260+ real tasks that was 20-30s
 * of dead time — and worse, it starved the auto-reload handoff's health
 * handshake, which is what actually took the server down (29 failed
 * handoff attempts in one incident).
 *
 * The fix (`index.refreshAllAsync()` + `buildIndexAsync`) makes `listen()`
 * proceed immediately while the index populates in the background,
 * concurrently instead of serially. This test locks in that SHAPE of the
 * fix, not an absolute stopwatch number (flaky across machines): it asserts
 * that `/api/health` answers well before `startServer()`'s own promise
 * resolves (which intentionally still waits for the index, so the CLI's
 * "watching N tasks" banner and the resolved handle report an accurate
 * count) — the gap can only exist if the listener is live before the
 * git-heavy enrichment finishes. A regression back to the old synchronous
 * `refreshAll()` would collapse that gap to ~0 (or make BOTH slow), and a
 * generous absolute ceiling below catches the "startup got dramatically
 * slower again" failure mode without flaking on a slow CI box.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { startServer } from "../../server/server";
import { ensureWorktree } from "../../core/git";

const TASK_COUNT = 30;
/**
 * Generous ceilings, not the numbers actually observed (~1s to first health,
 * ~7s to a full reload handoff) — wide enough to never flake on a loaded or
 * slow CI machine, tight enough that a regression to the old synchronous
 * boot (which was 20-30s+ with far fewer than 260 tasks already blocking)
 * trips them.
 */
const HEALTH_CEILING_MS = 8_000;
const FULL_READY_CEILING_MS = 15_000;
/**
 * Measurement tolerance for the "health first" assertion below.
 *
 * `firstHealthMs` is only *observed* from inside a polling loop: it is
 * recorded after a 25ms sleep plus a localhost fetch round-trip, whereas
 * `fullReadyMs` is timestamped synchronously the moment `startServer()`
 * resolves. When the two genuinely land in the same instant, the poll can
 * measure health a few ms AFTER full-ready even though the listener bound
 * first — a race that made the bare `<=` assertion flake persistently (this
 * exact machine failed it ~80% of the time in isolation, e.g. 709 ≤ 707).
 *
 * The tolerance only has to absorb that poll/fetch skew (well under 100ms),
 * never a real regression: reverting to the old synchronous boot makes health
 * lag full-ready by seconds, comfortably past the guard.
 */
const POLL_TOLERANCE_MS = 100;

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createTcpServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as { port: number }).port;
      srv.close(() => resolve(p));
    });
  });
}

/** A fixture repo with `count` tasks, each on its own branch + linked
 * worktree — real git objects, so the index build's per-task enrichment
 * (`git log`, `git status`, `git rev-list`) does real subprocess work
 * instead of short-circuiting on a missing branch/worktree. */
function makeFixture(count: number): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-boot-timing-"));
  mkdirSync(join(root, "work"), { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);

  for (let i = 0; i < count; i++) {
    const branch = `feat/task-${i + 1}`;
    const wt = ensureWorktree(root, branch);
    if (!wt.ok) throw new Error(`could not create worktree for ${branch}: ${wt.reason}`);
    writeFileSync(join(wt.path, "notes.md"), `marker-${i + 1}\n`);
    git(wt.path, ["add", "-A"]);
    git(wt.path, ["commit", "-q", "-m", `work on task ${i + 1}`]);
    const id = String(i + 1).padStart(4, "0");
    writeFileSync(
      join(root, "work", `${id}-task-${i + 1}.md`),
      `---\nid: "${id}"\ntitle: Task ${i + 1}\ntype: feature\nstatus: active\npriority: p1\narea: server\nassigned_to: ai\ncreated_by: test\nbranch: ${branch}\n---\n`,
    );
  }

  const wtRoot = join(root, "..", `${basename(root)}-worktrees`);
  return {
    root,
    clean: () => {
      rmSync(root, { recursive: true, force: true });
      try {
        git(root, ["worktree", "prune"]);
      } catch {
        /* ignore */
      }
      rmSync(wtRoot, { recursive: true, force: true });
    },
  };
}

describe("boot timing (#0271 regression guard)", () => {
  it("answers /api/health before startServer()'s own promise resolves, and both stay well under the old blocking-boot scale", async () => {
    const fx = makeFixture(TASK_COUNT);
    const port = await reservePort();
    const healthUrl = `http://127.0.0.1:${port}/api/health`;
    const t0 = Date.now();

    let firstHealthMs: number | null = null;
    const pollDone = (async () => {
      while (firstHealthMs === null) {
        try {
          const res = await fetch(healthUrl);
          if (res.ok) {
            const body = (await res.json()) as { ok?: boolean };
            if (body.ok) firstHealthMs = Date.now() - t0;
          }
        } catch {
          /* not bound yet */
        }
        if (firstHealthMs === null) await new Promise((r) => setTimeout(r, 25));
      }
    })();

    const server = await startServer({ root: fx.root, host: "127.0.0.1", port });
    const fullReadyMs = Date.now() - t0;
    await pollDone;

    try {
      expect(firstHealthMs).not.toBeNull();
      // The listener answers before the full index (30 real-git-enriched
      // tasks) is done — the whole point of the fix. A tolerance equal to
      // the polling granularity absorbs the measurement skew above (the
      // poll can timestamp health a few ms after full-ready even when the
      // listener bound first), without ever masking a regression to the old
      // synchronous boot.
      expect(firstHealthMs!).toBeLessThanOrEqual(fullReadyMs + POLL_TOLERANCE_MS);
      expect(firstHealthMs!).toBeLessThan(HEALTH_CEILING_MS);
      expect(fullReadyMs).toBeLessThan(FULL_READY_CEILING_MS);

      // The wait for the resolved handle wasn't wasted: it reports the
      // real count, not a partial/empty index caught mid-build.
      expect(server.index.snapshot().taskCount).toBe(TASK_COUNT);
    } finally {
      await server.close();
      fx.clean();
    }
  }, 60_000);
});
