---
id: "0188"
title: Test fixtures leak real child processes on interrupt across the suite (vitest worker-thread signal gap)
type: bug
status: review
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/test-fixtures-leak-real-child-processes-
model_override: default
created_at: "2026-08-14T06:34:37Z"
updated_at: "2026-08-16T12:01:19Z"
---
## Activity

- 2026-08-14T06:34:37Z · created · unknown


## Problem

`src/ui-app/tests/release-agent.test.ts` was found leaking real orphaned
processes: it spawns a deliberately-infinite fake agent binary and only
cleans it up (`killSpawns` + `rmSync`) in a per-test `try/finally`. That
never runs if the whole process is torn down (Ctrl-C mid-run, a CI job
killed, a timeout that aborts hard) — 900+ leaked `repoos-release-*`
directories were found in `/tmp` going back 2.5 days, each holding a real
orphaned process still consuming resources. Fixed in that one file
(2026-08-14, commit 737f031) with a `beforeAll` sweep that reaps any stale
same-prefix fixture before the suite's own fixtures are created —
self-healing on the next run regardless of how the previous one died.

A first attempt at a fix (registering `process.on('SIGINT'/'SIGTERM', ...)`
inside the test file to clean up on interrupt) looked plausible but does
NOT work and should not be tried again: this project's vitest has no `pool`
override in `src/ui-app/vite.config.ts`, so it defaults to the `"threads"`
pool. Worker threads never receive OS signals directly — only the main
vitest CLI process does, and it tears down workers via `worker.terminate()`
on interrupt, which bypasses any handler registered inside the test file
entirely. Verified this directly: the handler was present and correct-looking,
ran fine under `bun test`, and still never fired under a real `kill -INT`
against the vitest process.

**Same pattern, not yet fixed, confirmed leaking:**
- `src/ui-app/tests/pause-resume.test.ts` — `mkdtempSync(tmpdir(), "repoos-pause-")`,
  same try/finally-only cleanup.
- `src/ui-app/tests/reload.test.ts` — `mkdtempSync(tmpdir(), "repoos-reload-")`,
  same try/finally-only cleanup.
- Confirmed by directory count in `/tmp` at time of filing: **730** leaked
  `repoos-pause-*`/`repoos-reload-*` directories, same accumulation pattern
  as the 900+ found for `repoos-release-*`.

## Desired UX

Every test fixture in the suite that spawns a real child process self-heals
on the next run, regardless of how the previous run died — no manual `/tmp`
archaeology needed to notice or fix a leak.

## Acceptance criteria

- [ ] `pause-resume.test.ts` and `reload.test.ts` get the same kind of fix as
      `release-agent.test.ts` (737f031) — a `beforeAll`/equivalent sweep of
      stale same-prefix fixtures, not a signal handler (confirmed not to work
      under this project's vitest thread pool — see Problem).
- [ ] Consider extracting the sweep-and-reap logic (currently duplicated
      inline in `release-agent.test.ts`) into a small shared test helper so
      the next spawn-a-real-process fixture gets this for free instead of
      needing its own copy-pasted implementation.
- [ ] The 730 already-leaked `repoos-pause-*`/`repoos-reload-*` directories
      in `/tmp` get cleaned up (either as part of this task, or confirm
      they're stale enough that the new sweep logic reaps them on its own
      next run).
- [ ] `repoos check` passes.

## Notes for AI

- Read `src/ui-app/tests/release-agent.test.ts`'s `reapStaleFixtures()` and
  its surrounding comment in full before starting — it explains exactly why
  the naive signal-handler approach fails and documents the working
  alternative. Don't re-litigate that; port the same approach.
- Do not attempt to fix this via `pool: "forks"` in `vite.config.ts` (switching
  the whole suite off worker threads) as a shortcut — that's a much bigger,
  riskier infra change than this task's scope, and wasn't verified to
  actually solve the problem either (forked child processes might still be
  killed abruptly rather than signaled cleanly by vitest's own interrupt
  handling — untested).

## Activity

- 2026-08-14T10:32:36Z · status inbox→ready
- 2026-08-16T11:45:10Z · model_override
- 2026-08-16T11:45:14Z · status ready→active, branch
- 2026-08-16T12:01:19Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
