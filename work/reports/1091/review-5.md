---
task: "1091"
pass: 5
at: "2026-11-11T20:41:57.681Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/repoos-restart-restart-the-running-serve
state: ok
tree_identity: "f8d6aa818:"
---
## Verdict
`needs some work` — `restartCommand` now tells a down server's user to run `repoos restart`, which refuses when nothing is listening, so the offline recovery hint no longer restarts anything.

## Relevance
`still relevant` — `main` has no CLI restart path for a hand-run or supervised server, and the Kamrai case (system-domain KeepAlive daemon) is covered by detection.

## Evidence
None

## Bugs
Prior-pass status: pass-4 #1 (warning names all in-flight work), #2 (managed port match), #4 (stop-then-start manual command) are fixed. #3 is fixed for the timeout paths (each now prints a `manualCommand`). #5 tests are added (external success, classify, cancelled-work summary).

**Class: a hint shown when the server is DOWN must start it, not restart it.** One instance, and it is a regression.

- `src/core/service-manager.ts:162-168` (`restartCommand`) now returns `cd <root> && repoos restart --port N` for the hand-run case. It is served as `restartCommand` from `/api/health` (`src/server/routes/info.ts:86`) and copied by the offline banner (`src/ui-app/src/lib/uiRecovery.ts:61`, `UiRecoveryBanner.vue:30-32`). That banner appears on "connection refused", which is exactly when no server is listening.
- With no server running, `restartRepoServer` returns "No running RepoOS server found … Start one with `repoos serve`" (`src/core/server-restart.ts:404`) and exits 1. The copied command starts nothing. This breaks the #0959 contract that the hint works while the server is down.
- `user-docs/troubleshooting.md` (the "Not running" bullet) documents the same command as the fix for this state, so it is wrong too.
- `src/core/service-manager.test.ts` (the `restartCommand` block) was changed to lock in the regression.
- Fix: keep `repoos serve --port N` in `restartCommand` for the down case (the managed kickstart branch is correct as is), restore the test, and reword the troubleshooting bullet. Alternatively make `repoos restart` start a hand-run server when none is found. No other hint in the diff has this problem: the `status.ts` `restartHint` is only shown for a running stale server.

## Edge cases
- `detectDarwinSupervisor` (`supervisor-detect.ts`, `ppid === 1` branch): a hand-run server whose terminal closed is re-parented to launchd and is refused as uncertain. It fails closed, but it is a false refusal for criterion 3.
- The uncertain-refusal command is `kill PID && cd … && repoos serve …`. Run on a KeepAlive job, the second command races the supervisor's respawn and can leave an unsupervised hand-run server on the port.
- Not verified here: a live non-sudo KeepAlive LaunchDaemon respawn, and whether `launchctl print system` lists pids without root. Both are covered by fixtures only.

## Suggestions (non-blocking)
- `src/core/doctor.ts:1940,1964` still say `repoos stop` then `repoos serve`. Consider pointing them at `repoos restart` once the down-state hint is fixed.
- Hand-run respawn uses `stdio: "ignore"` (`spawnHandRunServe`), so the server's logs are lost. Say so in `user-docs/cli.md` or redirect to a log.
- Dedupe `--quiet` when it appears in both the argv and the forced list (`src/commands/serve.ts`).

## Verdict
`needs some work` — the offline "not running" restart hint (`restartCommand`) runs `repoos restart`, which refuses when no server is up.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

