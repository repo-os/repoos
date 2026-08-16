---
id: "0216"
title: Orphaned serve processes starve the close-out gate and cause false failures
type: bug
status: review
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/orphaned-serve-processes-starve-the-clos
model_override: default
pm_model_override: default
created_at: "2026-08-15T07:06:54Z"
updated_at: "2026-08-16T10:30:41Z"
---
## Problem

272 `repoos serve` processes were found running simultaneously on one developer machine. Nearly all are leftovers: preview servers and test-fixture servers whose roots point at deleted temp directories (`/private/var/folders/.../repoos-release-*`, `.../repoos-autoprev-*`). They are never reaped, so every close-out validation and every test run adds more.

The load they generate makes the close-out gate fail on timing-sensitive tests that pass perfectly well on their own. #0211 failed its gate twice in a row, on a DIFFERENT test each time:

1. `tests/watcher.test.ts:147` — `waitFor` timed out on "deletion detected by reconciliation poll"
2. ~~`tests/repo-store.test.ts:805` — `TypeError: Cannot read properties of undefined (reading 'removeItem')` (localStorage absent)~~ **— NOT THIS TASK. See the correction below.**

Item 1 pass in isolation in the candidate worktree, and the FULL suite on the exact candidate merge passes. Earlier the same day, `agent-review` and `auto-preview` failed the same way and passed on re-run.

## CORRECTION (2026-08-15): item 2 was misattributed — do not chase it here

The `repo-store.test.ts:805` localStorage failure is **not** contention. It is
100% deterministic and runtime-dependent, and it was fixed on main in commit
`086496be`.

Node >= 25 ships the Web Storage API and defines `localStorage` as an accessor
on `globalThis` that resolves to `undefined` unless `--localstorage-file` is
passed. vitest's jsdom environment only installs jsdom globals for keys not
already present, so it skips `localStorage` entirely and every storage test
crashes. It only ever hit the pipeline because the close-out gate runs
`repoos check` via `process.execPath` — the serving process's runtime, Homebrew
Node 26.7.0 under launchd — whereas a developer running `bun run test` by hand
gets Node 24, where the key is absent and jsdom installs its own Storage.

Measured on an idle machine, same code, seconds apart:
`Node 26.7.0 → 3 failed | 41 passed`, `Node 24.19.0 → 44 passed`. 668ms. Zero
load. Fixed with a vitest setup shim (`src/ui-app/tests/setup/web-storage.ts`).

**The lesson for whoever picks this task up:** a failure that reproduces
*identically* is a real defect, not contention — contention lands on a different
test each run. Verify that distinction before assuming load is the cause, and
reproduce under the exact runtime the gate uses (`/opt/homebrew/bin/node`), not
whatever `node` resolves to in your shell. See the "search the error, then check
the versions" section of AGENTS.md.

Item 1 (`watcher.test.ts` timeout) is still believed to be genuine contention
and remains in scope.

The user-visible effect: "Move to done" fails repeatedly with a different unrelated test each time, and there is no way to tell a real regression from contention noise.

## Desired UX

- Serve/preview processes are reaped when their task or fixture goes away, so they cannot accumulate
- The close-out gate does not fail a branch because the machine was busy

## Acceptance criteria

- [ ] Root cause identified for serve processes surviving their owning task/test — including fixture servers whose root directory no longer exists
- [ ] A serve process whose root directory is gone exits on its own rather than running indefinitely
- [ ] Existing reaper logic (`src/server/serve-reaper.ts`) is audited against this case and extended or fixed to cover it
- [ ] Tests clean up any servers they spawn, including on failure paths
- [x] The close-out gate distinguishes an infrastructure/timeout failure from a genuine test failure, and does not permanently fail the job on the former — done in `c56cde72`: the validating phase retries once, and classifies the result (identical reason → real failure; differing reasons → machine load)
- [ ] Timing-sensitive tests (`watcher`, `repo-store`, `agent-review`, `auto-preview`) are made robust to load, or given deadlines that scale with contention
- [ ] A way to see and clear orphaned serve processes (CLI subcommand or startup sweep) — partially done in `48d5f06c`/`f7fb670f`: the Control page now shows a live census and warns above a threshold. Classification uses ppid, so a fixture server with a live parent counts as in-flight, not abandoned. Reaping is still manual.

## Notes for AI

- Reproduce with `ps ax | grep 'dist/cli/index.js serve' | wc -l` after several close-outs and test runs.
- Distinguish the live control-plane server (root = the real repo) from fixture/preview servers (root under a temp dir) before killing anything — a sweep must never kill the user's own server.
- `src/server/serve-reaper.ts` and `src/server/preview.ts` already own preview lifecycle; start there.
- Previews are documented as ephemeral ("they stop when the task leaves active/review"), so surviving processes are a contract violation, not just untidiness.
- Consider whether the validation gate should retry once on failure before marking the job failed, given how expensive a false failure is for the user.

## Related

- #0211 (failed its gate twice on unrelated flaky tests)
- #0215 (the failure message that made these look like merge conflicts)

## Activity

- 2026-08-15T07:06:54Z · created · unknown
- 2026-08-15T08:18:34Z · status inbox→ready
- 2026-08-15T08:18:45Z · status ready→active, branch
- 2026-08-15T08:26:27Z · watchdog: auto-surfaced stuck task · status active→ready · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-15T09:06:18Z · body
- 2026-08-15T10:31:56Z · status ready→active
- 2026-08-15T10:32:42Z · pm_model_override


## Scope update (2026-08-16)

The reload-handoff EPIPE failure was fixed separately. Do not change reload handoff for this task; focus on reproducing and eliminating leaked fixture/preview serve processes, and proving close-out checks remain reliable under that load.
- 2026-08-15T17:00:19Z · body
- 2026-08-16T00:22:22Z · model_override
- 2026-08-16T10:30:41Z · status active→review
