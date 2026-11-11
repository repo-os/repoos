---
task: "1091"
pass: 8
at: "2026-11-11T23:05:42.131Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/repoos-restart-restart-the-running-serve
state: ok
tree_identity: "600275a6d:"
---
Repeated review classes: pid and supervisor detection has settled on the lock-based ownership proof, and pass 7's read-after-signal bug is fixed with a regression test. Still recurring are fallback manual commands and hints that drop the serve flags or name `repoos serve`/`repoos stop` (three flag-less fallbacks remain), plus the unawaited `void cmd…` dispatch. A human should look at this fallback-text pattern, since each pass finds another copy.

## Verdict
`good to go` — round-7 flag fix holds, every acceptance criterion has code and a test; leftovers are fallback text and hardening.

## Relevance
`still relevant` — no `repoos restart` exists on main, and the hand-written LaunchDaemon (Kamrai) case is still unaddressed there.

## Evidence
None

## Bugs
None found

## Edge cases
- Round-7 fix verified: `resolvedFlags` is computed at `src/core/server-restart.ts:485`, before `stop`, and is used by the spawn and both hand-run manual commands. The new test at `src/core/server-restart.test.ts:274` covers the registry-located case.
- Not verified live: non-root `launchctl print system` pid rows and a non-sudo KeepAlive respawn. Both are fixture-only. If detection fails, the restart refuses, so it fails closed.
- A hand-run server re-parented to pid 1 (nohup, or its launching script exited) is refused as `uncertain` (`supervisor-detect.ts:259`). That fails closed against criterion 3.
- `service-manager.ts` `repoosBinary` changes only when `repoos` is not on PATH; before, that case threw. Mention it in close-out, as review 7 asked.
- The hand-run respawn resolves `which repoos`, not the CLI that is running `restart`. A different install on PATH would respawn an older version.
- The respawned server inherits the caller's env. If the caller has `REPOOS_PREVIEW_CHILD=1`, no lock is written and the wait times out.
- The landing checklist says "1 fail" but lists none. The only candidate is the missing review verdict, which this pass supplies. I did not re-run it.

## Suggestions (non-blocking)
- Flag-less manual commands, same class as round 7: `server-restart.ts:463` (refuse path), `:552` (external timeout) and `:585` (hand-run stop timeout). Use `resolvedFlags` in each.
- Preflight `repoosBinary()` before the stop, so a missing binary does not leave the server down.
- `spawnHandRunServe` (`:338`) only logs async spawn errors under `REPOOS_DEBUG`. Surface ENOENT instead of a 45s generic timeout.
- Hand-run respawn uses `stdio: "ignore"`, so logs are lost. Say so in `user-docs/cli.md`.
- `cmdServe` passes `args` and then re-appends `--quiet` and `--no-tailscale-https`, so the lock can hold duplicates. Dedupe.
- `src/index.ts`'s `void cmdRestart(rest)` (`src/cli/index.ts:302`) has no `.catch`.
- Stale hints remain: `src/core/doctor.ts:1940` (stop, then serve) and `src/commands/status.ts:824` ("restart `repoos serve`").
- `restartHint(_server)` ignores its argument.
- The reporter's `landable` bullet-count quirk is out of this task and is not addressed.

## Verdict
`good to go` — round-7 flag fix holds, every acceptance criterion has code and a test; leftovers are fallback text and hardening.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

