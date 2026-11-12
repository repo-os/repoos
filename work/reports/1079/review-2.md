---
task: "1079"
pass: 2
at: "2026-11-12T13:44:03.243Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/server-crashed-on-unhandled-rejection-ki
state: ok
tree_identity: "f4c6326c9:"
---
## Verdict

`good to go` — Round 1 blocking issues are fixed; acceptance criteria are met at the shared cleanup and process-handler layers.

## Relevance

`still relevant` — The fatal `unhandledRejection` from denied `process.kill` remains a real outage mode; this branch contains it without broadening the fatal surface.

## Evidence

None

## Bugs

None found

## Edge cases

- Pass 1 poll hang, marker path mismatch, and missing bell/handler tests are fixed on HEAD (`processGroupAlive` false on `EPERM`, early exit in `terminateProcessGroupAndWait`, shared `serverCrashMarkerPath`, `notifyAttentionProcessSignalFailure` wired at `startServer`).
- `processGroupAlive` returning false on `EPERM` can skip a post-`close` group sweep when the probe is denied but stragglers might exist; avoids infinite wait, may leave orphans.
- `check-runner.ts` / `branchless-release.ts` still call `terminateProcessGroupAndWait` without `taskId`, so bell text may lack task context on those paths.
- AC3 restart is documented as OS service-manager owned; foreground `repoos serve` still needs an external supervisor.
- AC4 is covered by mocked `runDoneStep` / `terminateProcessGroupAndWait`, not a live `startServer` EPERM scenario.
- No boot test asserts `serverCrash` attention after reading the crash marker.
- `EPERM` on `uncaughtException` stays fatal; only `unhandledRejection` uses `isRecoverableUnhandledRejection`.
- Landing checklist: task-file merge WARN only (close-out heals); one landable FAIL is procedural, not code.

## Suggestions

- Optional: pass `taskId` through `check-runner` timeouts; add a focused `startServer` marker-replay test for AC3 notice.

## Verdict

`good to go`

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

