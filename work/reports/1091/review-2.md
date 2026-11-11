---
task: "1091"
pass: 2
at: "2026-11-11T12:32:36.557Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/repoos-restart-restart-the-running-serve
state: ok
tree_identity: "951ac654d:"
---
## Verdict
`needs some work` — launchd detection never matches real macOS output, so the Kamrai KeepAlive daemon is restarted as a hand-run server; a spawn failure also leaves the server stopped.

## Relevance
`still relevant` — `repoos restart` is not on main, and the hand-written KeepAlive daemon case is still unhandled there.

## Evidence
None

## Bugs
Prior pass 1 status: #2 (flags) fixed via lock `serveFlags`; #3 (PID checks, unchecked `waitPidGone`) fixed; #5 (systemd `user@`) fixed; #6 (warning order) fixed. #1 and #4 still open, as the classes below.

**1. Supervisor parsers assume a launchctl/systemctl format nobody observed** (`src/core/server-restart.ts`, `parseLaunchctlPidPrint`, `parseSystemdPidStatus`). Tests only use fixtures the tests write.
- `parseLaunchctlPidPrint` requires `label = "…"`. I ran read-only `launchctl print pid/N` on this Mac for `com.apple.Finder` (pid 714) and `com.apple.homed` (pid 68569). Neither output has a quoted `label =` or a `domain =` line; the job appears only as `name = …` in nested blocks. So the Kamrai daemon falls through to `hand-run`: SIGTERM, then a second `repoos serve` spawned while KeepAlive also respawns. Success can then be reported on the wrong server. I could not test a system LaunchDaemon itself.
- Same function: `domain` defaults to `gui` with no uid, so `manualCommand` becomes `launchctl kickstart -k gui/<label>`, which is not a valid target.
- `parseSystemdPidStatus`: same pattern, never checked against real `systemctl status <pid>` output.

**2. Unknown classified as hand-run** (`detectSupervisor`, darwin branch; previous finding #4, still open). `launchctl print pid/N` exits 0 even for a nonexistent pid (checked pid 99999999). So the darwin `catch` and its `ppid === 1` guard never run on macOS. A parse miss returns `kind: "none"`, which means hand-run. The test "returns uncertain when launchctl fails and ppid is 1" mocks a failure real launchctl does not produce.

**3. Unhandled failure after the old server is stopped** (lifecycle ordering, unhandled spawn errors). In `restartRepoServer`'s hand-run branch, stop → `waitPidGone` → `spawnHandRunServe` has no try/catch.
- `repoosBinary()` (`src/core/service-manager.ts:217`) computes `dirname(dirname(import.meta.url))`. From `dist/core/` that is `dist`, and `join(…, "dist", "cli", "index.js")` gives `dist/dist/cli/index.js`. That path does not exist. If `repoos` is not on PATH, it throws after the server is already down, and `void cmdRestart` rejects unhandled. Same defect as previous finding #1, now in the function the new code calls.
- The spawned child has no `'error'` listener, so an ENOENT is an uncaught event.

## Edge cases
- Locks written before this change have no `serveFlags`. A hand-run restart of such a server silently drops `--preview-overrides` and similar flags. Consider reading argv via `ps`, which `verifyPidServesRepo` already does.
- If the old hand-run server takes more than 8s to exit, restart fails with nothing running and no rollback.
- Managed path checks only `status === "running"`. A stopped managed unit plus a hand-run server on the same port could collide on start.
- Linux: a hand-run session process where `systemctl status <pid>` exits non-zero is classified uncertain, so every such restart is refused. Unverified.
- The "adopted after restart" claim in the warning and `user-docs/cli.md` is asserted, not checked (#0214).
- The engineering report is stale (source commit `67b0e42a9` vs HEAD `951ac654d`), and no current-round report exists. Its claims were not used as evidence.

## Suggestions
- Map the lock pid to its label with `launchctl list`, whose `PID  Status  Label` rows I confirmed on this Mac. Use `ps -o ppid=` to detect launchd parentage. Derive the manual command from the real domain (`gui/<uid>` or `system`).
- Make "no label parsed" return `uncertain`, not `none`.
- Add tests fed with captured real `launchctl`/`systemctl` output.
- Wrap the hand-run spawn; fix `repoosBinary` to resolve `dist/cli/index.js` correctly.

## Could not verify (environment)
- A real KeepAlive LaunchDaemon run as non-sudo `nick`: respawn timing, system-domain output, and whether `kickstart` works without root. Not run.

## Verdict
`needs some work` — launchd detection never matches real macOS output, so the Kamrai daemon is restarted as hand-run; a spawn failure also leaves the server stopped.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

