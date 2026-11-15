# Agent process safety (#0675)

Evidence from the first agent-driven project run (opex, story #0008): engineer
agents repeatedly ran machine-wide `pkill -f …` to clean up dev servers they had
started. Those commands matched every process on the laptop with the same name and
killed the owner's long-running servers. Separately, detached `repoos serve`
processes started from agent shells were SIGTERMed within about 15–45 seconds.

## Managed agent turns: process groups

RepoOS spawns each managed agent CLI with its own POSIX process group (`detached:
true` on the spawn). When the turn ends — natural exit, deliberate stop, or
handoff — the runner signals that group so any helper the agent started in the
same tree is torn down without touching unrelated processes elsewhere on the
machine.

If a child daemonizes out of the group (double-fork to PID 1), it can survive the
group reap; the runner logs any PIDs still in the group after SIGKILL as a leak
warning in the task transcript.

### Escaped grandchildren and the orphan sweeper (#1134)

The group reap cannot see a child that called `setsid`/`setpgid` (agent CLIs'
own shell tools do this) or was reparented to PID 1, so on 2026-11-16 seven
orphaned `vitest` processes burned CPU for an hour after their turns ended.
Turn teardown now does more than signal the group:

- Every managed agent spawn gets `REPOOS_TURN_MARKER` (repo-scoped, task-scoped,
  run-scoped) in its environment; the marker is inherited by all descendants.
- At turn end RepoOS collects the group leader's PID tree, processes whose cwd
  is inside the turn's worktree, and processes carrying that exact marker, then
  sends TERM to exact PIDs and KILL after a short grace. It re-scans once after
  TERM in case a child daemonized during the grace window. Matching is never by
  process name, and `pkill`/`killall` are never used.
- A control-plane sweeper runs every 15s. It finds **reparented** (`ppid 1`)
  same-uid processes whose cwd is inside a managed worktree or whose marker was
  minted by this checkout, skips anything a live turn still owns (tree, workdir
  or marker), and stops the rest by exact PID. Each kill is written to
  `system.log` with task id, command, CPU time and age, and appears on the
  dashboard (`System Resources`).
- The pressure guard treats a still-running orphan as a critical cause with its
  PIDs, instead of only reporting high load; already-reaped processes are an
  advisory warning. The CTO digest gets its own "Orphaned run processes"
  section with PIDs, command, CPU time and age.

The cwd probe is batched `lsof` on macOS and `/proc/<pid>/cwd` on Linux. The
environment marker is Linux-only for a foreign process (macOS SIP hides another
process's environment), so macOS relies on the PID tree and worktree cwd; both
paths are covered by `run-process-teardown.test.ts` and the injectable unit
tests in `run-processes.test.ts`.

`sweepOrphanedRunRootProcesses` (test helper teardown) is bounded as well: it
stops at a wall-clock deadline, caps the rows it examines and roots it collects,
and skips agent-prompt-sized command lines, so one pathological `ps` line can
no longer hang `beforeAll`.

Engineer and reviewer prompts, and the default agent instructions in
`repoos.toml`, tell agents never to use `pkill` / `killall`. The runner also
emits a transcript warning when a shell tool call looks like a pattern kill.

## Why detached `repoos serve` from an agent shell dies quickly

The control plane runs a periodic stray-serve reaper (every ~30 seconds, see
`src/server/server.ts` and `parseServeScan` in `src/server/system.ts`). A
`repoos serve` process is classified as:

| Situation | Census kind | Reaped? |
| --- | --- | --- |
| Parent still alive (supervising) | `in-flight` | No |
| Known task preview PID | `known-preview` | No |
| This server's own PID | `control-plane` | No |
| Detached serve, parent dead, same repo root as this server | `stray` | **Yes** (SIGTERM) |
| Detached serve for another repo whose root still exists | `foreign` | No |

An agent that starts `repoos serve` in the background (nohup, `&`, or a new
session) typically leaves the serve process with PPID 1 once the agent CLI exits
or the shell returns. For the same repository root the control plane is serving,
that serve is indistinguishable from an abandoned orphan and is reaped — usually
within one reaper interval (~30s), which matches the ~15–45s observed in the
field run.

Direct `repoos serve` from a managed agent is also blocked at the CLI when
`REPOOS_AGENT=1` (unless preview-child or reload replacement); the stray reaper
is the explanation for serves that were started anyway (bypass, external shell, or
before the guard existed).

## Test helper processes (#1017)

The test suite spawns real helper processes: fake agent CLIs on a fixture
`PATH`, preview servers, HTTP fixtures and `bun -e` service stubs. A test's own
`try/finally` is not enough. If `repoos check` kills a `bun run test` subprocess
for overrunning its budget, or a worker is terminated, the `finally` never
runs, the helper reparents to pid 1, and it sits there for days — dozens of
them contributed to the 2026-11-03 memory-pressure incident.

Rules for tests:

- Spawn a long-lived helper with `spawnTestProcess()` from
  `src/ui-app/tests/helpers.ts`, not raw `spawn()`. It starts the helper in its
  own process group and records the pid in
  `$REPOOS_TEST_TMP_ROOT/test-processes.jsonl`, so teardown can find it even
  after the fixture directory is gone.
- Do not use `pkill`, `killall` or any name/pattern kill for test cleanup. Stop
  a helper early with `process.kill(pid)` (or the group leader pid) that you
  recorded.
- `global-reap` (Vitest `globalSetup`) is the backstop. At teardown it kills
  recorded pids and any process whose **command line names this run's unique
  temp root**, waits for SIGTERM then SIGKILL, and fails the run with a
  `[global-reap] test helper process(es) survived teardown` error if anything
  is left. It keeps the run root in place for diagnosis. At setup it reaps
  stale fixture roots from both the inherited `TMPDIR` and the real OS temp
  dir, and kills helpers whose `repoos-vitest-*` run root no longer exists
  (orphans from an older teardown bug).
- Matching is always by the run-scoped temp path in the command line, never by
  process name. A concurrent run in another checkout has its own run root that
  still exists (and a heartbeat), so the sweep leaves it alone; helpers younger
  than the stale-fixture age are also excluded.

When adding a new spawning fixture, verify leak behavior by killing the test
run mid-test once (Ctrl-C), then checking
`ps -eo pid,etime,command | grep "$TMPDIR/repoos-"` shows nothing after the
next `bun run test`/`repoos check` starts.

### Automatic control-plane safety net

The suite's own teardown cannot run when the whole test process is SIGKILLed.
The control plane therefore runs a second, machine-wide census
(`scanTestHelperProcesses` / `reapLeakedTestHelpers` in
`src/server/system.ts`, wired in `src/server/server.ts`):

- Only the long-lived control plane arms it (`shouldReapStrayServeProcesses`),
  never a preview child or an in-process `port: 0` test server.
- First pass about 3 minutes after boot, then every 12 minutes — never at
  startup, so a booting gate cannot be disturbed.
- A process is a candidate only when **all** hold: same uid, `ppid` 1 (its
  spawner is gone), older than 30 minutes, and its command line, cwd (via
  `lsof`) or `REPOOS_TEST_HELPER` env tag names a RepoOS test temp dir
  (`repoos-vitest-*`, `repoos-cli-api-*`, `repoos-preview-req-*`).
- It is skipped when a live test run still owns that temp dir (a supervised
  process names it, or the run-root heartbeat is under 15 minutes old) and
  never touched when the path is inside this repo's task-worktree directory.
- Reaping is `SIGTERM` to the process group, a 1.5 s grace, then `SIGKILL` to
  survivors. Each reap (or failed reap) is written to
  `.repoos/logs/system.log` as `test-helper-reaper: …`.
- Matching is by the unique run-scoped temp path or env tag, never by process
  name, so an unrelated `node`/`bun` process is never touched.

## What `repoos service` does differently

`repoos service install` registers the server with launchd (macOS) or systemd
(Linux). The service manager starts `repoos serve` as the service's main process,
not as a child of an agent turn. It is not parented to a short-lived agent shell,
is not in an agent turn process group, and is not classified as a stray orphan of
a finished turn. It survives independently of agent lifecycle.

For local interactive work, a foreground `repoos serve` in a terminal tab you keep
open is equally stable: the shell remains the supervising parent until you stop it.

## Related

- Playbook: `user-docs/running-with-agents.md` § Processes and servers
- Stray census: `docs/previews.md` (preview process groups) and #0216
- Field report: `docs/field-reports/2026-10-05-opex-first-run.md` items 16 and 31
