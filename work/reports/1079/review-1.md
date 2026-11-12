---
task: "1079"
pass: 1
at: "2026-11-12T12:39:27.949Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/server-crashed-on-unhandled-rejection-ki
state: ok
tree_identity: "3f591d88a:"
---
## Verdict

`needs some work` — `terminateProcessGroupAndWait` can spin forever on `EPERM` (with `processGroupAlive`), and the new EPERM unit test times out at 5s.

## Relevance

`still relevant` — The fatal `unhandledRejection` path and missing crash notice are real; the fix direction matches the incident.

## Evidence

None

## Bugs

- **`src/core/process-group.ts` (EPERM poll-loop hang):** After `signalGroup` swallows `EPERM`, `processGroupAlive` still treats `kill(-pid, 0)` → `EPERM` as alive, so the `while (processGroupAlive)` loop never exits when the group is signal-denied. Callers (`handoff.ts`, `done.ts`, `remote-validation.ts`, `check-runner.ts`) can hang cleanup instead of finishing. Confirmed: `bunx vitest run src/core/process-group.test.ts` — ESRCH passes, EPERM hits the 5s timeout.

- **`src/core/process-group.test.ts`:** The EPERM case above is red under default vitest timeout; close-out’s full suite should fail unless this file is excluded.

- **`src/server/server.ts` (crash-marker path):** Fatal handler writes `join(root, ".repoos", "server-crash-pending.json")` (hardcoded); `startServer` reads `join(root, config.cacheDir, …)`. Diverges when `cacheDir` ≠ `.repoos`, so post-crash dashboard notice never appears.

## Edge cases

- AC4: no test tying EPERM during validation/check teardown to “server stays up” and consistent task state; only isolated `terminateProcessGroupAndWait` mocks.
- AC2: no injected `unhandledRejection` exercise of `registerFatalHandlersOnce` — only `isRecoverableUnhandledRejection` unit tests in `child-stdin-epipe.test.ts`.
- AC1: log line has PID/signal, not task id; desired bell on failed kill not wired (cleanup uses `console.warn` only).
- `EPERM` on `uncaughtException` remains fatal; only `unhandledRejection` uses the recoverable classifier.

## Suggestions

- On `EPERM`/`ESRCH` in `signalGroup`, exit `terminateProcessGroupAndWait` (don’t poll); align marker write with `config.cacheDir`; add handler injection test and a validation-cleanup EPERM integration test per AC2/AC4.

## Verdict

`needs some work`

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

