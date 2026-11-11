---
task: "1091"
pass: 1
at: "2026-11-11T10:55:25.124Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/repoos-restart-restart-the-running-serve
state: ok
tree_identity: "d59786caa:"
---
## Verdict
`needs some work` — the restart path lookup is broken, the hand-run restart drops server flags, and PID checks are missing before signalling.

## Relevance
`still relevant` — `repoos restart` does not exist on main, and the Kamrai gap (hand-written KeepAlive daemon, no managed-service restart) is still open.

## Evidence
None

## Bugs
1. **Wrong CLI path in hand-run spawn.** `src/core/server-restart.ts:479` (`cliEntryPath`) joins `CORE_DIR/../dist/cli/index.js`. The built file lives in `dist/core/`, so this resolves to `dist/dist/cli/index.js`, which does not exist. It runs only when `which repoos` fails. The child is spawned with `stdio: "ignore"`, so the failure is silent, and the restart times out with the wrong manual command. `repoosBinary()` in `service-manager.ts` uses `dirname(dirname(import.meta.url))` and is correct. No test covers this because `spawn` is injected.

2. **Hand-run restart drops server flags.** `spawnHandRunServe` (`server-restart.ts`, around line 324) passes only `--port`, `--host` and `--quiet`. It drops `--preview-overrides`, `--no-preview-overrides` and `--no-tailscale-https`, and adds `--quiet` the original may not have had. The spec requires "the same flags". The serve lock does not record them, so the fix needs to record them.

3. **Signals sent to unverified PIDs (PID reuse class).** `locateRepoServer` returns `lock.pid` when `pidAlive` is true, without checking the process is a `repoos serve`. When `/api/health` is unreachable, `restartRepoServer` skips the root check and SIGTERMs that PID on the hand-run and external paths. A recycled PID owned by the same user would be killed. Instances: the external-supervisor `stopPidExact` call and the hand-run `stopPidExact` call. `waitForPidGone`'s return value is also ignored (hand-run path), so a server still shutting down gets a second spawn that hits EADDRINUSE.

4. **Detection failure falls back to hand-run (fallback class).** In `detectExternalSupervisor`, the launchd and systemd `catch` blocks return null, and `parseLaunchctlPidPrint` returns null when no label matches. Each classifies a supervised server as `hand-run`, which SIGTERMs it and spawns a second server beside the one launchd respawns. Instances: the darwin catch, the linux catch, and the null-parse fallthrough. `readPpid` (line 83) is exported and unused, so it was probably meant for this check and never wired in.

5. **systemd parsing is over-broad.** `parseSystemdPidStatus` accepts any `●` unit, including `user@<uid>.service`. A hand-run server in a user session could then be classified as supervised, and the restart would print `systemctl --user restart user@<uid>.service`, which restarts the whole user manager. Both branches also hard-code `--user`, which is wrong for system units.

6. **Engineer warning comes after the restart.** `src/commands/restart.ts` prints the "engineer agent(s) were running" warning only after success. The stop has already happened, and the message claims agents are adopted, which this change does not verify. Spec: restarts must not interrupt engineers "without telling the user". The warning should print before the stop.

## Edge cases
- `isManagedService` checks only that a registry entry exists. If the managed unit is stopped and a hand-run server holds the port, `restartService` can kickstart a second server onto the same port.
- The launchd label and domain parsers were tested only against a fixture the tests wrote (`label = "org.repoos…"`). Real `launchctl print pid/N` output and its access rules for a non-root user are unverified.
- The `--port` parse produces NaN when the value is missing, and that reaches "No running server" with no explanation.
- Engineer adoption (#0214) after restart is asserted, not checked in this diff.

## Suggestions
- Record the serve argv (or the flags that matter) in the lock or registry so the hand-run path can replay them.
- Use `dirname(dirname(import.meta.url))` as `repoosBinary` does, and add a test that exercises the real path resolution.
- Before SIGTERM, confirm the PID is a `repoos serve` for this root, or require a healthy `/api/health` on the lock port.
- Add tests for the systemd `user@` case and the detection-error fallback.

## Could not verify (environment)
- A real LaunchDaemon with `KeepAlive` as a non-sudo user (the Kamrai case), including respawn timing and whether `launchctl print pid/N` works without root. Implementer already flagged this.

## Verdict
`needs some work` — the hand-run path is broken and the classification and PID checks need fixing before sign-off.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

