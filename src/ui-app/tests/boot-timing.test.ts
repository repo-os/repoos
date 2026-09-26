/**
 * Boot-time regression guard (#0271), with a deterministic ordering assertion
 * added by #0330.
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
 * concurrently instead of serially.
 *
 * ── How the ordering guarantee is now PROVEN (#0330) ───────────────────────
 * Asserting "the listener binds before the index is populated" is a race, and
 * three formulations of it were tried and reverted, each failing for a
 * different reason — worth recording so nobody re-tries them:
 *
 *  1. `firstHealthMs <= fullReadyMs + tolerance`, comparing a timestamp
 *     observed through a real HTTP poll (TCP round trip + the server's event
 *     loop actually servicing the socket) against one captured synchronously
 *     in-process. These two don't degrade at the same rate under load: on a
 *     busy machine the in-process timestamp barely moves while the
 *     HTTP-polled one can balloon far more (observed: ~17s vs ~6s in one
 *     run — an 11s gap in the WRONG direction, not a few ms of jitter).
 *  2. Kept the HTTP poll but made the comparison a boolean ("was
 *     `startServer()` already resolved when health first answered ok") —
 *     ALSO flaked under load, because a severely CPU-starved loopback fetch
 *     can fail to complete until well after even a correctly-early listener
 *     has finished the index build. That's a liveness property of the whole
 *     box, not of RepoOS's code — no phrasing of an HTTP-timed comparison is
 *     robust to it.
 *  3. Moved fully in-process — `onListening` (fires the instant
 *     `server.listen()`'s callback runs) compared against `fullReadyMs`, or
 *     against `index.snapshot().taskCount` read at that same instant. Robust
 *     to load, but NOT robust to runtime speed: on Bun (this project's own
 *     default — see `bun-runtime-optin`) this fixture's 20-task index build
 *     reliably completes in ~3s, while `startServer()` has ~23 unrelated
 *     `await`s between kicking off `refreshAllAsync()` and reaching
 *     `listen()` — so under Bun the build reliably WINS that race and
 *     finishes before `listen()` is even called. Confirmed deterministic, not
 *     flaky: `bunx vitest` (runs under Node) passed 5/5; `bun run --bun
 *     vitest` (forced Bun, ~10x faster here) failed 2/2. That is not a
 *     regression — the build genuinely runs concurrently, it's just fast.
 *
 * All three shared one root cause: the winner of the race depended on how
 * fast the machine and the runtime happened to be, so the assertion measured
 * the box, not RepoOS. The fix is to stop racing. `startServer` accepts a
 * test-only `indexBuildGate`, forwarded to `LiveIndex.refreshAllAsync`, which
 * awaits it after the build has FINISHED and immediately before its result is
 * swapped into the index. A test can hold that gate open indefinitely, which
 * parks the build at a known "built but not yet published" point:
 *
 *   - the build provably got all the way to the swap (it ran to completion —
 *     no dependence on fixture size, runtime, or git/OS caching),
 *   - so if `listen()` fires at all while the gate is held, the listener
 *     provably did not wait for the index to be published.
 *
 * What it does NOT assert, having been tried and reverted again here: that the
 * index is still EMPTY (`snapshot().taskCount === 0`) at the instant the
 * listener binds. That is the check this file reached for in formulation 3,
 * and it looks like the same guarantee in state form — but `WorkWatcher` has
 * its own 5s `reconcile()` poll that calls `applyFileChange` for every task
 * file it hasn't seen yet, populating the very `byId` map the gated build
 * would have. So the count at bind time is 0 or the full fixture depending on
 * which of two unrelated producers got there first: measured 20 (poll wins)
 * on every Node run and 0 (build wins) on every Bun run. The gate proves an
 * ORDERING; only an ordering claim can use it. The count is asserted in the
 * second test instead, once the build is released.
 *
 * That makes the guarantee a hard fact instead of a timing measurement, and
 * it is identical under Node and under Bun — which is the only reason to
 * believe it. The first test below is the ordering guard; it needs no
 * `REPOOS_STRICT_TIMING` and no wall-clock budget to mean anything. The second
 * test is the older liveness check, which is a genuine wall-clock measurement
 * and is still skipped outside the isolated single-worker pass.
 *
 * ── Why the second test only runs under REPOOS_STRICT_TIMING ───────────────
 * Its ceilings are wall-clock budgets, and a real fixture boot spawns hundreds
 * of `git` subprocesses. Run inside the parallel worker pool (or an ad-hoc
 * `vitest` invocation on a busy machine) those durations balloon from
 * contention, not regressions — a false negative that has cost real debugging
 * time and made agents loop on "check failed" for tests their diff never
 * touched. `scripts/run-tests.mjs` runs this file in a dedicated pass 2:
 * single worker, `--retry 2`, `REPOOS_STRICT_TIMING=1`. That's the only
 * context where these numbers mean anything, so outside it that test skips.
 * `bun run test` and `repoos check` always exercise pass 2; to run this file
 * directly: `REPOOS_STRICT_TIMING=1 bunx vitest boot-timing`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";
import { ensureWorktree } from "../../core/git";

// Enough real git-enriched tasks that the index build is genuine concurrent
// work (every task's enrichment runs real `git` subprocesses in real linked
// worktrees). Was 30; lowered once close-out reliably reaps its worktrees
// (feat/worktree-gc) so a realistic board no longer accumulates dozens.
// Note the ordering test below no longer needs a big fixture — the injected
// gate makes the build's duration irrelevant to what it asserts — but the
// liveness test still benefits from a real board, and one shared fixture
// serves both.
const TASK_COUNT = 20;

/**
 * Budget for the background index build to reach the injected park point. NOT
 * a benchmark: the only wall-clock-dependent claim in this file is that this
 * many milliseconds is enough, which is the same generous-backstop logic the
 * health ceilings below use. Everything the ordering test actually asserts is
 * a discrete event, and a machine that blows this budget fails this line
 * saying so — never the ordering claim.
 */
const PARK_CEILING_MS = 30_000;
/**
 * Budget for the listener to bind *after* the build is already parked. From
 * that point the only work left in `startServer` is its own boot path, so this
 * is the window in which "the listener is waiting on the index build" (the
 * #0271 regression) becomes visible.
 */
const BIND_AFTER_PARK_CEILING_MS = 15_000;
/** Same reasoning, for answering one `/api/health` while the build is parked. */
const HEALTH_WHILE_PARKED_CEILING_MS = 15_000;
/**
 * Sanity backstops for the liveness test, not tight benchmarks. Measured
 * empirically at ~16-17s on this machine from ordinary desktop background load
 * alone (Chrome, WindowServer, other apps) — no other test running, no vitest
 * worker contention, just what's normally open — so 8s/15s were tighter than
 * the test's own "wide enough to never flake on a loaded machine" goal
 * actually delivered.
 */
const HEALTH_CEILING_MS = 30_000;
const FULL_READY_CEILING_MS = 30_000;

/**
 * Only `scripts/run-tests.mjs` pass 2 (single worker, machine to itself) sets
 * this. It gates the wall-clock ceilings in the second test — everywhere else
 * those measure contention, not correctness — so that test skips rather than
 * emit a false failure. The first test is deliberately NOT gated: it makes no
 * wall-clock claim, so it runs everywhere.
 */
const STRICT_TIMING = process.env.REPOOS_STRICT_TIMING === "1";

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

/** A promise plus the one-shot function that settles it. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const TIMED_OUT = Symbol("timed out");

/**
 * `p`'s value if it settles within `ms`, else `TIMED_OUT`. Rejections
 * propagate, so a real failure (e.g. `startServer` rejecting on a bind error)
 * surfaces as itself rather than as a timeout.
 */
function within<T>(ms: number, p: Promise<T>): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout>;
  const expiry = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([p, expiry]).finally(() => clearTimeout(timer));
}

/** A fixture repo with `count` tasks, each on its own branch + linked
 *  worktree — real git objects, so the index build's per-task enrichment
 *  (`git log`, `git status`, `git rev-list`) does real subprocess work
 *  instead of short-circuiting on a missing branch/worktree. */
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
  // One fixture for both tests: building 20 worktrees is the expensive part,
  // and neither test mutates it in a way the other would notice.
  let fixture: { root: string; clean: () => void };

  beforeAll(() => {
    fixture = makeFixture(TASK_COUNT);
  }, 60_000);

  afterAll(() => {
    fixture?.clean();
  });

  it("binds the listener, and answers health, while the background index build is still parked (#0330)", async () => {
    const port = await reservePort();
    const healthUrl = `http://127.0.0.1:${port}/api/health`;

    // The build's park point, held open for the whole body of this test: the
    // build reaches its final swap step and then stops, no matter how fast (or
    // slow) this box is.
    const parked = deferred();
    const atGate = deferred();
    // Recorded as flags as well as deferreds so a failure can name WHICH event
    // is missing rather than just "the pair didn't arrive".
    let buildFinished = false;
    let boundWhileParked = false;
    const bound = deferred();

    const serverPromise = startServer({
      root: fixture.root,
      host: "127.0.0.1",
      port,
      indexBuildGate: () => {
        buildFinished = true;
        atGate.resolve();
        return parked.promise;
      },
      onListening: () => {
        boundWhileParked = true;
        bound.resolve();
      },
    });

    try {
      // Two waits, not one — and sequential, because the causal order makes
      // each deadline mean exactly one thing:
      //   1. the build reaches the park point: dominated by the git-heavy build,
      //      so a miss here is "this box is slow / the build is broken", never
      //      the ordering claim.
      //   2. the listener binds AFTER the build is parked: from here on the
      //      only thing left in `startServer` is its own boot path, so a miss
      //      here is precisely the #0271 regression and cannot be blamed on
      //      load. A single `Promise.all` deadline can't tell those two apart,
      //      and reporting "machine too slow" for a real regression is exactly
      //      the misdiagnosis this suite has been guilty of before.
      const parkedOk = await within(PARK_CEILING_MS, atGate.promise);
      expect(
        parkedOk !== TIMED_OUT,
        `the background index build never reached the injected \`indexBuildGate\` within ` +
          `${PARK_CEILING_MS}ms, so the ordering assertions below could not run. Two causes, ` +
          `indistinguishable at this deadline: the test seam is no longer wired up ` +
          `(\`ServeOptions.indexBuildGate\` not reaching \`LiveIndex.refreshAllAsync\` — check ` +
          `that first, it is a one-grep fix), or this box is too slow to build a ` +
          `${TASK_COUNT}-task index inside ${PARK_CEILING_MS}ms. Neither is the #0271 regression.`,
      ).toBe(true);
      // The build is provably parked at its final step, which is what licenses
      // the ordering claim below. Also guards against a vacuous pass: if the
      // gate were never invoked, the next assertion would hold for the wrong
      // reason (a build that simply never ran).
      expect(
        buildFinished,
        "`indexBuildGate` was never invoked, so the build never parked — the test seam " +
          "is not wired up and the ordering assertion below is vacuous.",
      ).toBe(true);

      // The regression this exists to catch. A boot that builds the index to
      // completion before calling `listen()` can never satisfy this: the build
      // is parked at the gate and the boot path is waiting on it.
      const boundOk = await within(BIND_AFTER_PARK_CEILING_MS, bound.promise);
      expect(
        boundOk !== TIMED_OUT && boundWhileParked,
        `the background index build reached the park point and then \`server.listen()\` still ` +
          `never bound within ${BIND_AFTER_PARK_CEILING_MS}ms. The build is provably parked ` +
          `with its result ready, so the boot path is sequencing the listener behind the ` +
          `index build again — this IS the #0271 regression.`,
      ).toBe(true);

      // Deliberately NOT asserted here: "the index is empty when the listener
      // binds". It reads like the obvious state form of this same guarantee,
      // and it is the trap this task fell into twice — but it is NOT sound.
      // `WorkWatcher` runs a 5s `reconcile()` poll that calls
      // `applyFileChange` for every task file it hasn't tracked yet, filling
      // the same `byId` map the gated build would have. So the count at bind
      // time is the full fixture or 0 depending on whether the watcher's poll
      // or the gated build got there first — a second race, this one decided
      // by the watcher's schedule rather than the runtime. Measured on this
      // very file: 3/3 failures under Node (poll wins), 3/3 passes under Bun
      // (build wins). The gate makes an ORDERING provable, and an ordering is
      // what this test claims; the count belongs to the second test, where the
      // build has been released and the watcher's opinion no longer matters.

      // The user-visible half of the same guarantee: a parked index build must
      // not make the server unreachable. `/api/health` answers `ok: true` from
      // a stale or empty index, so this says "accepting and serving requests"
      // without depending on the build having finished — and, unlike the
      // discarded count check, nothing else has to be true for it to hold.
      const health = await within(
        HEALTH_WHILE_PARKED_CEILING_MS,
        fetch(healthUrl).then(
          (res) => res.json() as Promise<{ ok?: boolean }>,
          () => ({}) as { ok?: boolean },
        ),
      );
      expect(
        health !== TIMED_OUT && health.ok === true,
        "the server did not answer /api/health while the index build was parked — the " +
          "listener bound but nothing could be served until the build finished.",
      ).toBe(true);
    } finally {
      // Always release, so the build can complete and `startServer` can
      // resolve — otherwise a failed assertion would leak a live listener and
      // a parked promise into the next test in this file.
      parked.resolve();
      const server: ServerHandle | null = await serverPromise.catch(() => null);
      if (server) await server.close();
    }
    // Only reached at the budgets' sum (~55s) when something is already wrong;
    // a healthy boot lands here in about a second under Bun. The generous
    // timeout exists so each budget above can be hit and reported with its own
    // message instead of the whole test being cut off mid-diagnosis.
  }, 90_000);

  it("answers /api/health before startServer()'s own promise resolves, and both stay well under the old blocking-boot scale", async (ctx) => {
    if (!STRICT_TIMING) {
      ctx.skip(
        "wall-clock timing test — only meaningful with the machine to itself. " +
          "Runs in `bun run test` / `repoos check` (run-tests.mjs pass 2). " +
          "Direct: `REPOOS_STRICT_TIMING=1 bunx vitest boot-timing`. " +
          "The ordering assertion in the test above needs neither this flag nor a budget.",
      );
    }
    const port = await reservePort();
    const healthUrl = `http://127.0.0.1:${port}/api/health`;
    const t0 = Date.now();

    // In-process: fires the instant `server.listen()`'s own callback runs.
    let listeningMs: number | null = null;
    const serverPromise = startServer({
      root: fixture.root,
      host: "127.0.0.1",
      port,
      onListening: () => {
        listeningMs = Date.now() - t0;
      },
    });

    // Over the network: a liveness smoke check, not a regression assertion —
    // does the server actually answer real HTTP requests, within a generous
    // ceiling. Deliberately NOT compared against `fullReadyMs`/`listeningMs`:
    // no formulation of that comparison has proven robust (see header). This
    // only proves the server is alive at all, and it runs with NO gate — the
    // ungated boot, exactly as `repoos serve` does it.
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

    const server = await serverPromise;
    const fullReadyMs = Date.now() - t0;
    await pollDone;

    try {
      // Only proves `listen()` fired at all on the ungated path. The ordering
      // guarantee itself is asserted (deterministically) in the test above.
      expect(listeningMs).not.toBeNull();

      // The server answers real requests at all, within a generous ceiling.
      expect(firstHealthMs).not.toBeNull();
      expect(firstHealthMs!).toBeLessThan(HEALTH_CEILING_MS);
      expect(fullReadyMs).toBeLessThan(FULL_READY_CEILING_MS);

      // The wait for the resolved handle wasn't wasted: it reports the
      // real count, not a partial/empty index caught mid-build.
      expect(server.index.snapshot().taskCount).toBe(TASK_COUNT);
    } finally {
      await server.close();
    }
  }, 60_000);
});
