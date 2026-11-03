import { appendFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from "node:child_process";

/**
 * Remove a fixture repo AND its `<root>-worktrees` sibling (see config.ts
 * `worktreesDir`). Any test that calls `ensureWorktree`/`removeWorktree` on a
 * tmpdir fixture creates that sibling; a bare `rmSync(root)` leaves it behind
 * forever (the reap only used to catch it as a rider on the primary). Use this
 * in the fixture's `clean()`/`afterEach` instead of `rmSync(root, …)`.
 */
export function rmFixture(root: string): void {
  rmSync(root, { recursive: true, force: true });
  rmSync(`${root}-worktrees`, { recursive: true, force: true });
}

/**
 * Shared test helpers for the process-spawning E2E fixtures (0076).
 *
 * These tests spawn real child processes (fixture CLI stubs on a fake PATH,
 * git, etc.) and poll for observable state. The old per-file `waitFor`
 * helpers polled with a hard 3s ceiling, which flaked `repoos check` under
 * load: right after a full build, or while other worktrees are building in
 * parallel, a spawn can legitimately take longer than 3s to boot, so the
 * poll threw and the whole test file failed. These helpers keep the fail-fast
 * intent (a genuinely-broken spawn still surfaces within ~10s) but give a
 * busy machine real headroom.
 */

/** Default ceiling for waitFor() polls on real spawned processes, ms. */
export const WAIT_FOR_TIMEOUT_MS = 60_000;
/** How often waitFor() re-checks, ms. Fast so healthy paths never slow down. */
export const WAIT_FOR_POLL_MS = 25;

/**
 * Poll `fn()` until it returns truthy. Throws with `label` in the message so
 * a genuinely-broken spawn is still diagnosed quickly.
 */
export async function waitFor(
  fn: () => boolean,
  label: string,
  timeoutMs = WAIT_FOR_TIMEOUT_MS,
): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, WAIT_FOR_POLL_MS));
  }
}

/**
 * Stale fixtures from a PAST run only unwound via per-test `try/finally`,
 * which never runs if the whole process is torn down (Ctrl-C, a CI job killed
 * mid-suite). Vitest's default pool runs test files in worker threads, and OS
 * signals go to the main vitest process only — it kills workers via
 * `worker.terminate()` on interrupt, so even a `process.on('SIGINT', ...)`
 * registered in a test file never fires. That gap is how 900+ of these
 * fixtures (each holding a real, deliberately-infinite fake-agent process)
 * were found leaked in `/tmp` days later (see #0185 investigation, fixed for
 * `repoos-release-` in 737f031). Self-healing on the next run is the only
 * mechanism that survives every kill path, so each fixture prefix reaps its
 * stale directories in `beforeAll` — before this suite's own fixtures exist.
 * Anything younger than the sweep age is presumed still in use by a
 * concurrently running suite and left alone.
 *
 * Returns the number of directories removed, so a caller (global-reap) can
 * warn when a leak source is quietly filling the tmpdir.
 */
export const STALE_FIXTURE_AGE_MS = 10 * 60 * 1000;

/** One live process row from `ps`, with the process-group id it belongs to. */
export interface ProcessEntry {
  pid: number;
  pgid: number;
  command: string;
  /** Elapsed time in ms; 0 when `ps` output could not be parsed. */
  ageMs: number;
}

/** Parse `ps` etime (`[[dd-]hh:]mm:ss`) into milliseconds. */
function parseElapsedMs(value: string): number {
  const match = value.trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  return (
    (Number(days ?? 0) * 86_400 +
      Number(hours ?? 0) * 3_600 +
      Number(minutes) * 60 +
      Number(seconds)) *
    1_000
  );
}

/** A helper pid recorded by a test or fixture, for teardown even if its fixture dir is gone. */
export interface TestProcessRecord {
  pid: number;
  label?: string;
  at?: number;
}

let ownPgidCache: number | undefined;

/** This process's POSIX process-group id (the group that must never be signalled). */
export function ownProcessGroupId(): number {
  if (ownPgidCache !== undefined) return ownPgidCache;
  const res = spawnSync("ps", ["-o", "pgid=", "-p", String(process.pid)], {
    encoding: "utf8",
    timeout: 5_000,
  });
  const value = Number(res.stdout?.trim());
  ownPgidCache = Number.isFinite(value) && value > 0 ? value : process.pid;
  return ownPgidCache;
}

/** Every live process with its process-group id. Empty on Windows (no portable groups). */
export function listProcessEntries(): ProcessEntry[] {
  if (process.platform === "win32") return [];
  const res = spawnSync("ps", ["-axo", "pid=,pgid=,etime=,command="], {
    encoding: "utf8",
    timeout: 5_000,
  });
  if (res.status !== 0 || !res.stdout) return [];
  const entries: ProcessEntry[] = [];
  for (const line of res.stdout.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!match) continue;
    entries.push({
      pid: Number(match[1]),
      pgid: Number(match[2]),
      ageMs: parseElapsedMs(match[3]),
      command: match[4],
    });
  }
  return entries;
}

/** Synchronous sleep without spawning anything (keeps the sweep sync for `beforeAll` callers). */
function sleepSync(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      /* busy fallback */
    }
  }
}

/**
 * Signal one helper. Only a process that leads its OWN group is signalled by
 * group (`-pid`); everything else is signalled by pid alone, so we can never
 * reach a process group that merely happens to share a numeric id.
 */
function signalEntry(entry: ProcessEntry, signal: NodeJS.Signals): void {
  if (process.platform === "win32") return;
  if (entry.pgid === entry.pid && entry.pgid !== ownProcessGroupId()) {
    try {
      process.kill(-entry.pid, signal);
      return;
    } catch {
      /* group gone — fall back to the leader */
    }
  }
  try {
    process.kill(entry.pid, signal);
  } catch {
    /* already gone */
  }
}

/**
 * Terminate the given pids (and the groups they lead), waiting for SIGTERM to
 * take effect and escalating to SIGKILL. Returns pids that survived SIGKILL.
 * A pid absent from the process list is skipped: it already exited.
 */
export function terminateTestPidsSync(pids: number[]): number[] {
  if (process.platform === "win32") return [];
  const targets = [...new Set(pids)].filter(
    (pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid,
  );
  if (targets.length === 0) return [];
  // A zombie is already dead: it only remains in `ps` until its parent reaps
  // it, and no signal can remove it. Counting it as a survivor made every
  // synchronous check (and the leak guard) fail on a correctly killed child.
  const livePids = (): Set<number> =>
    new Set(
      listProcessEntries()
        .filter((entry) => !entry.command.includes("<defunct>"))
        .map((entry) => entry.pid),
    );
  const entries = new Map(listProcessEntries().map((entry) => [entry.pid, entry]));
  const live = targets.filter((pid) => entries.has(pid));
  if (live.length === 0) return [];
  for (const pid of live) signalEntry(entries.get(pid)!, "SIGTERM");
  sleepSync(200);
  const afterTerm = livePids();
  for (const pid of live) {
    if (afterTerm.has(pid)) signalEntry(entries.get(pid)!, "SIGKILL");
  }
  sleepSync(100);
  const afterKill = livePids();
  return live.filter((pid) => afterKill.has(pid));
}

/** True when `command` names `root` as a path (not merely as a string prefix). */
function commandMatchesRoot(command: string, root: string): boolean {
  return (
    command.includes(`${root}/`) ||
    command.includes(`${root}"`) ||
    command.includes(`${root}'`) ||
    command.includes(`${root} `) ||
    command.endsWith(root)
  );
}

/**
 * Live processes whose command line names one of `roots`. The roots are
 * run-scoped temp paths (`repoos-vitest-XXXX`, a per-file temp root, a fixture
 * dir), so this targets only helpers this test run spawned — never a process by
 * name, and never another checkout's run.
 */
export function findProcessesMatchingRoots(
  roots: string[],
  entries = listProcessEntries(),
): ProcessEntry[] {
  const normalized = roots.map((root) => root.replace(/\/+$/, "")).filter(Boolean);
  if (normalized.length === 0) return [];
  return entries.filter(
    (entry) =>
      entry.pid !== process.pid &&
      normalized.some((root) => commandMatchesRoot(entry.command, root)),
  );
}

/** Terminate every process whose command line names one of `roots`; returns survivors. */
export function killProcessesMatchingRoots(roots: string[]): number[] {
  return terminateTestPidsSync(findProcessesMatchingRoots(roots).map((entry) => entry.pid));
}

/** The temp root a test run owns (set by global-reap's setup). */
export function testRunRoot(): string {
  return process.env.REPOOS_TEST_TMP_ROOT ?? defaultOsTmpdir();
}

/**
 * Record a spawned helper pid at the run root so global teardown can kill it
 * even after the fixture directory (and its spawns.log) has been removed. The
 * record survives a worker kill; the next run's stale-root sweep reads it.
 */
export function recordTestProcess(pid: number, label?: string): void {
  const root = process.env.REPOOS_TEST_TMP_ROOT;
  if (!root || !Number.isInteger(pid) || pid <= 0) return;
  try {
    appendFileSync(
      join(root, "test-processes.jsonl"),
      `${JSON.stringify({ pid, label, at: Date.now() })}\n`,
    );
  } catch {
    /* best effort — the command-line sweep is the backstop */
  }
}

/** Read the run root's pid registry (empty when missing/malformed). */
export function readTestProcessRecords(root: string): TestProcessRecord[] {
  let text: string;
  try {
    text = readFileSync(join(root, "test-processes.jsonl"), "utf8");
  } catch {
    return [];
  }
  const records: TestProcessRecord[] = [];
  for (const line of text.trim().split("\n")) {
    if (!line) continue;
    try {
      const rec = JSON.parse(line) as TestProcessRecord;
      if (typeof rec.pid === "number") records.push(rec);
    } catch {
      /* partial line from a killed writer */
    }
  }
  return records;
}

/**
 * Pids spawned through {@link spawnTestProcess} in this worker. The
 * per-file setup hook (`tests/setup/process-guard.ts`) kills these after every
 * test and after the file, so a failed assertion or a timeout cannot leak a
 * helper even before global teardown runs.
 */
const trackedTestPids = new Set<number>();

/** Take (and clear) the pids this worker spawned through the shared helper. */
export function takeTrackedTestPids(): number[] {
  const pids = [...trackedTestPids];
  trackedTestPids.clear();
  return pids;
}

/**
 * Spawn a helper in its own process group and record it for teardown. Use this
 * for any test-owned long-lived child: the group is signalled on teardown
 * (afterEach/global teardown), including after a test timeout or worker kill.
 */
export function spawnTestProcess(
  command: string,
  args: string[] = [],
  options: SpawnOptions = {},
): ChildProcess {
  const child = spawn(command, args, {
    ...options,
    detached: process.platform !== "win32",
  });
  if (child.pid) {
    trackedTestPids.add(child.pid);
    recordTestProcess(child.pid, [command, ...args].join(" "));
  }
  return child;
}

function readSpawnedPidsFromLog(path: string): number[] {
  let log: string;
  try {
    log = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const pids: number[] = [];
  for (const line of log.trim().split("\n")) {
    if (!line) continue;
    try {
      const rec = JSON.parse(line) as { pid?: number };
      if (typeof rec.pid === "number") pids.push(rec.pid);
    } catch {
      /* not a pid record (some fixtures log raw text) */
    }
  }
  return pids;
}

/**
 * How deep the spawn-log walk goes below a stale root. A fixture's log lives at
 * `runRoot/file-XXX/repoos-XXX/spawns.log` (3 levels) and companion fixtures can
 * nest further, so the old fixed 4-level recursion could miss a deeper child
 * and leave it running after a worker kill (#0859). Deep enough for any real
 * fixture layout, shallow enough that walking a huge stale checkout cannot run
 * away.
 */
export const SPAWN_LOG_SCAN_DEPTH = 32;

/**
 * Find every helper pid recorded below a root (each fixture's `spawns.log`
 * plus the run root's `test-processes.jsonl`) without following symlinks.
 * Iterative rather than recursive so the depth limit is explicit and a deep
 * fixture tree cannot overflow the stack; the whole fixture tree within
 * {@link SPAWN_LOG_SCAN_DEPTH} is covered, however it is nested.
 */
export function collectSpawnedLogPids(root: string, maxDepth = SPAWN_LOG_SCAN_DEPTH): number[] {
  const pids: number[] = [];
  const pending: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];
  while (pending.length > 0) {
    const { dir, depth } = pending.pop()!;
    pids.push(...readSpawnedPidsFromLog(join(dir, "spawns.log")));
    if (depth === 0) pids.push(...readTestProcessRecords(dir).map((rec) => rec.pid));
    if (depth >= maxDepth) continue;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      /* unreadable — the rm below still removes it */
      continue;
    }
    for (const entry of entries) {
      // `isDirectory()` is false for symlinks, so the walk never escapes the
      // fixture root or revisits a loop.
      if (entry.isDirectory()) pending.push({ dir: join(dir, entry.name), depth: depth + 1 });
    }
  }
  return pids;
}

/**
 * Kill every helper recorded below a root and wait for it to exit. Returns the
 * pids that survived SIGKILL (normally none).
 */
export function killSpawnedLogs(root: string, maxDepth = SPAWN_LOG_SCAN_DEPTH): number[] {
  return terminateTestPidsSync(collectSpawnedLogPids(root, maxDepth));
}

/** Directories a run's fixtures can live in: the inherited temp dir and the real OS temp dir. */
function candidateTmpdirs(): string[] {
  const dirs = [tmpdir()];
  const osTmpdir = defaultOsTmpdir();
  if (!dirs.includes(osTmpdir)) dirs.push(osTmpdir);
  return dirs;
}

/**
 * Reap stale fixture directories from BOTH the inherited temp dir and the real
 * OS temp dir, killing the helpers they recorded before deleting their paths.
 *
 * The OS-tempdir half matters in managed agent runs: those set TMPDIR to a
 * directory inside the checkout, while `global-reap` deliberately creates its
 * run root under the real OS tempdir (see `defaultOsTmpdir`). Scanning only
 * `tmpdir()` therefore never saw the run roots that actually leak.
 *
 * Killing happens before removal because a helper's command line names the
 * fixture path; once the directory is gone the only remaining record of the
 * process is that path. Rows whose command line names the stale root are
 * killed by process group, so a shell-wrapped fixture's children go too.
 */
export function reapStaleFixtures(prefix: string): number {
  const cutoff = Date.now() - STALE_FIXTURE_AGE_MS;
  let removed = 0;
  for (const base of candidateTmpdirs()) {
    let entries: string[];
    try {
      entries = readdirSync(base);
    } catch {
      continue;
    }
    const stale: { root: string; name: string; worktreesSibling: boolean }[] = [];
    for (const name of entries) {
      if (!name.startsWith(prefix)) continue;
      // `<fixture>-worktrees` siblings (config.ts worktreesDir: a fixture at
      // `<tmp>/repoos-cliwt-XXXX` gets worktrees at `<tmp>/repoos-cliwt-XXXX-worktrees`)
      // used to be reaped ONLY as a rider on their primary dir. But a test's own
      // `rmSync(root)` cleanup removes the primary and leaves the sibling, so the
      // rider never fired and the tmpdir filled with tens of thousands of orphaned
      // `-worktrees` dirs (see #tmpdir-leak). They carry no spawns.log and no live
      // process — just age-check and delete them directly.
      const root = join(base, name);
      let mtimeMs: number;
      try {
        mtimeMs = statSync(root).mtimeMs;
      } catch {
        continue;
      }
      if (mtimeMs >= cutoff) continue;
      stale.push({ root, name, worktreesSibling: name.endsWith("-worktrees") });
    }
    const primaryRoots = stale.filter((item) => !item.worktreesSibling).map((item) => item.root);
    if (primaryRoots.length > 0) {
      // Collect recorded pids across every stale primary, then terminate once
      // (a per-root `ps` sweep would be very slow on a big leak).
      const recorded: number[] = [];
      for (const root of primaryRoots) recorded.push(...collectSpawnedLogPids(root));
      const matched = findProcessesMatchingRoots(primaryRoots).map((entry) => entry.pid);
      const survivors = terminateTestPidsSync([...recorded, ...matched]);
      if (survivors.length > 0) {
        console.warn(
          `[global-reap] ${survivors.length} helper process(es) survived SIGKILL under stale fixtures: ` +
            survivors.join(", "),
        );
      }
    }
    for (const item of stale) {
      rmSync(item.root, { recursive: true, force: true });
      removed++;
      if (!item.worktreesSibling) {
        // Still remove the matching sibling eagerly when the primary is present —
        // cheaper than waiting for a later iteration, and correct if it sorts before.
        try {
          rmSync(join(base, `${item.name}-worktrees`), { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    }
  }
  return removed;
}

/**
 * Kill helpers whose command line names a `repoos-vitest-*` run root that no
 * longer exists on disk. This is the recovery path for a run whose worker was
 * killed before its teardown could record anything: the root is removed but
 * the reparented helper still advertises the path in `ps`.
 *
 * A run root that still exists is left alone — that is some checkout's live
 * test run (its per-file fixtures and heartbeat are still valid), not an
 * orphan. Nothing is matched by process name.
 */
export function sweepOrphanedRunRootProcesses(minAgeMs = STALE_FIXTURE_AGE_MS): number {
  if (process.platform === "win32") return 0;
  const pattern = /(?:^|[\s"'=(])((?:\/[^\s"'=(]+)*\/repoos-vitest-[A-Za-z0-9]+)/g;
  const orphanRoots = new Set<string>();
  for (const entry of listProcessEntries()) {
    // Only helpers at least as old as a stale fixture: a live run whose root
    // was briefly missing (between teardown creating it and a worker starting)
    // must not lose its children to this sweep.
    if (entry.ageMs < minAgeMs) continue;
    for (const match of entry.command.matchAll(pattern)) {
      if (!existsSync(match[1])) orphanRoots.add(match[1]);
    }
  }
  if (orphanRoots.size === 0) return 0;
  const survivors = killProcessesMatchingRoots([...orphanRoots]);
  if (survivors.length > 0) {
    console.warn(
      `[global-reap] ${survivors.length} orphaned helper process(es) survived SIGKILL: ` +
        survivors.join(", "),
    );
  }
  return orphanRoots.size;
}

/**
 * The OS default temp directory, ignoring TMPDIR/TMP/TEMP for this call.
 * Managed agent runs often point those at a directory inside the checkout; nested
 * paths still satisfy `git rev-parse --is-inside-work-tree`, which breaks
 * nogit fixtures that use `mkdtempSync(join(tmpdir(), …))`.
 */
export function defaultOsTmpdir(): string {
  const saved = {
    TMPDIR: process.env.TMPDIR,
    TMP: process.env.TMP,
    TEMP: process.env.TEMP,
  };
  delete process.env.TMPDIR;
  delete process.env.TMP;
  delete process.env.TEMP;
  try {
    return tmpdir();
  } finally {
    if (saved.TMPDIR === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = saved.TMPDIR;
    if (saved.TMP === undefined) delete process.env.TMP;
    else process.env.TMP = saved.TMP;
    if (saved.TEMP === undefined) delete process.env.TEMP;
    else process.env.TEMP = saved.TEMP;
  }
}
