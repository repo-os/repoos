---
task: "1091"
pass: 4
at: "2026-11-11T19:03:26.447Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/repoos-restart-restart-the-running-serve
state: ok
tree_identity: "e339a8337:"
---
## Verdict
`needs some work` — `restart` silently cancels in-flight reviews and previews, and the managed-service path can restart the wrong server.

## Relevance
`still relevant` — nothing on main restarts a server this way, and the system-domain KeepAlive daemon from the report is now detected.

## Evidence
None

## Bugs
Prior findings: pass-3 #1 (system-domain lookup) is fixed; #2 (`managed` kind) and #3 (pid always verified) are fixed; pass-2 `dist/dist` and the spawn `error` listener are fixed. Open, grouped by class:

1. **Real shutdown, not a reload handover (all three paths).** `stopPidExact` sends SIGTERM, which runs `handle.close`. Outside a reload, `src/server/server.ts` ~4786–4801 calls `reviews.cancelAll()`, `freeformRuns.cancelAll()`, `previews.stopAll()` and `devTargets.stopAll()`. `src/commands/restart.ts:34` warns only about `activeEngineers` (`runner.running()`). Reviews, PM runs, previews and dev targets are killed with no warning. The UI's `POST /api/server/restart` reload path keeps them. Fix: use the reload handover when the server is healthy, or warn about and count every kind.

2. **Managed path ignores which server was located** (`src/core/server-restart.ts:99-100`, `classifyRestartPath`). `getServiceStatus(root)` is checked without comparing `entry.port` or the pid to `server`. With a managed service on 7272 and a hand-run server on 7373, `repoos restart --port 7373` restarts the managed service, then times out on 7373. Fix: require `managed.port === server.port`.

3. **Failure after SIGTERM leaves nothing running** (lifecycle ordering). `server-restart.ts:476-485` (`waitPidGone` timeout) returns no `manualCommand` and says "refusing to start a second serve" after the old server is already stopped. `server-restart.ts:507` gives a manual command without the replayed `serveFlags`. The external-supervisor timeout (~L445) does not say the server is now down.

4. **Manual command that does not restart** (`server-restart.ts:387`). The uncertain refusal prints `kill <pid>`, which only stops the server, and `user-docs/troubleshooting.md` tells users to run it. Print the launchctl or systemctl command, or say plainly that the server stays down.

5. **AC4/AC7 test gaps.** There is no test for the external-supervisor success path (new pid after respawn); `server-restart.test.ts:74` covers only the timeout. `classifyRestartPath` (managed port mismatch, managed refusal) is untested. The system-domain fixture (`supervisor-detect.test.ts` ~137) is hand-written, not captured. I checked read-only that `launchctl print system` rows are `pid status label` under `services = {`, which the parser handles.

## Edge cases
- `waitPidGone` uses `kill(0)`, which succeeds for an unreaped zombie child, so a hand-run server whose parent never reaps reports a false 8s timeout.
- Hand-run server with ppid 1 (terminal closed) is refused as uncertain.
- Linux `systemctl status <pid>` for a hand-run process in a user scope may hit the `.service` fallback and be refused. Not verified here.
- #0214: engineers are durable and re-adopted (`agents.ts` `adoptRunningAgents`), so the engineer warning is accurate. Reviews are not.
- No bare `node`, `npm` or `npx` in the diff. Merge: only the task's own file conflicts, per the landing checklist.

## Suggestions
- Dedupe `--quiet` / `--no-tailscale-https` in `src/commands/serve.ts:262-264` (pass-3 suggestion, still open).
- The hand-run respawn discards stdout and stderr (`stdio: "ignore"`); say so in docs or keep a log.
- Could not verify: a real non-sudo KeepAlive LaunchDaemon respawn on the Kamrai box.

## Verdict
`needs some work` — `restart` silently cancels in-flight reviews and previews, and the managed-service path can restart the wrong server.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

