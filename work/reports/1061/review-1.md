---
task: "1061"
pass: 1
at: "2026-11-08T15:56:32.410Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/checks-stop-repoos-bookkeeping-commits-f
state: ok
tree_identity: "f1ef08fe6:"
---
## Verdict
needs some work — source writes, failed queue flushes, and some check lifecycles bypass the protection.

## Relevance
still relevant — #0954 addressed cross-task bookkeeping commits and task-file drift, but not these broader check windows.

## Evidence
None

## Bugs
- **Incomplete lock/write-guard coverage:** `src/server/check-gate-lock.ts:349` defines `checkGateSourceWriteRefusal`, but nothing calls it; engineers can still edit source files during a check. Also, `src/commands/check.ts:2517-2525` installs the hook and acquires the lock only after remote validation begins. The task-scoped `merge-gate` check in `src/server/integration-orchestrator.ts` has no lock acquisition/release either.
- **Deferred-commit loss on flush failure:** `src/server/check-gate-lock.ts:278-299` ignores `commitFiles` failures, then clears the queue in `finally`. A Git/index-lock or other commit failure therefore drops queued records on both normal release and stale-lock recovery.
- **Crash/cancel leaves queued work pending:** `src/commands/check.ts:2525-2535` relies on `finally` to release the child-owned lock. If that check process is killed, the server remains running; `activeCheckGateForCommitRoot` ignores the dead PID, but stale-lock recovery only runs at server startup, so queued commits are not flushed until a later restart.
- **Custom cache directory misses locks:** `src/core/git.ts:2356-2357` defaults the commit hook’s cache path to `.repoos`, while lock acquisition uses configured `cacheDir`. With a custom cache directory, the hook cannot see the lock and bookkeeping commits are not deferred.

## Edge cases
Tests do not exercise source-write blocking, canceled/crashed checks with a live server, failed flushes, custom cache directories, or the close-out merge-gate path.

## Suggestions
None

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

