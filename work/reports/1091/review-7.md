---
task: "1091"
pass: 7
at: "2026-11-11T22:49:35.813Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/repoos-restart-restart-the-running-serve
state: ok
tree_identity: "96f47c4dd:"
---
Repeated review classes: pid and supervisor detection has been refined one pass at a time, and pass 6's argv-root bug is now fixed (the lock is the ownership proof, with `startedAt` guarding pid reuse). The doc drift flagged in pass 6 is also fixed. A new defect in the same family shows up here: the hand-run path reads process state after the process has been signalled. A human should look at the detection design rather than keep patching it per pass.

## Verdict
`needs some work` — hand-run restart respawns without its serve flags whenever the lock predates this build or the server is found via the registry, because flags are read from the dead pid after SIGTERM.

## Relevance
`still relevant` — no CLI restart path existed on main, and the managed, external and hand-run cases are all implemented here.

## Evidence
None

## Bugs
**Class: process state read after the signal (lifecycle ordering).** Every instance is in `src/core/server-restart.ts` `restartRepoServer`, hand-run branch.

- The `resolveFlags` closure falls back to `readProcessCommand(s.pid)` when `serveFlags` is empty. It is first called in the `spawn` argument, after `waitPidGone` has confirmed the old pid is gone, so `ps` returns nothing and flags become `[]`.
- Same closure, same bug, in the spawn-failure `manualCommand` and in the wait-failure `manualCommand`. Both call `resolveFlags(server)` after the stop.
- Triggers: any hand-run server whose lock predates `serveFlags` (every server started before this build, so the first restart after upgrade), and any server located via the registry branch, which always returns `serveFlags: []`. The respawned server loses `--preview-overrides`, `--quiet` and `--no-tailscale-https`. That breaks acceptance criterion 3 ("same flags").
- The `extractServeFlagsFromCommand` fallback exists for exactly the old-lock case, but it can never work in that position.
- Fix: resolve flags into the `LocatedServer` before `stop`, and use that value in all three places.
- Test gap: `keeps the old flags when restarting a hand-run server` injects `serveFlags` on the located server, so it never exercises the fallback or the registry path.

## Edge cases
- Read-only `launchctl print system` on this machine lists services with `pid status label` rows, so `parseLaunchctlListForPid` matches the format. No `org.repoos` label is present here, so the Kamrai path is still unverified live.
- `waitPidGone` treats a zombie as alive; if the parent never reaps, the hand-run restart fails closed after 8s. Acceptable.
- `service-manager.ts` `repoosBinary` now resolves the no-PATH fallback to a real `dist/cli/index.js` (previously it threw). That changes managed-service behaviour in one case, against the "do not change `repoos service` semantics" note. Mention it in the close-out.
- The engineering report's change summary lists about 100 files outside this diff. It was not used as evidence.

## Suggestions (non-blocking)
- `src/core/doctor.ts:1940` still says `repoos stop` then `repoos serve`; `src/commands/status.ts:824` still says "restart `repoos serve`".
- The hand-run stop-timeout `manualCommand` omits the serve flags.
- Hand-run respawn uses `stdio: "ignore"`, so logs are lost; say so in `user-docs/cli.md`.
- `restartHint(_server)` ignores its argument; simplify it.
- `src/commands/restart.ts`: `void cmdRestart(rest)` has no `.catch`.
- The lock-proof slack of 2 minutes is wider than needed; `/\bserve\b/` also matches `serve.ts`.

## Automated verification
- Browser console-error check: **skipped** (no UI change).
- Guard negative-test evidence: **skipped** (no check guard changed).

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

