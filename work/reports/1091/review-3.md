---
task: "1091"
pass: 3
at: "2026-11-11T17:38:23.650Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/repoos-restart-restart-the-running-serve
state: ok
tree_identity: "95ffb1cff:"
---
## Verdict
`needs some work` — the reported Kamrai case (system-domain LaunchDaemon, KeepAlive) is never detected, so `repoos restart` refuses it instead of restarting it.

## Relevance
`still relevant` — `repoos restart` is new on this branch, and the KeepAlive LaunchDaemon case is still unhandled on main.

## Evidence
None

## Bugs
Prior pass 2 items are fixed: the `dist/dist` path (now `compiledCliEntry`), the spawn `error` listener, `--preview-overrides` replay, and the stale-lock flags fallback. Still open or new, grouped by class:

1. **Supervisor lookup only reads the caller's launchd domain** (`src/core/supervisor-detect.ts`, `detectDarwinSupervisor`). `launchctl list` as uid 501 omits system daemons; I checked that `com.apple.mDNSResponder` and `com.apple.syslogd` are absent. `launchctl print system` runs without sudo and lists them with pids. The Kamrai job is in the system domain, so `org.repoos.serve.kamrai` never maps to its pid, `ppid` is 1, and the result is `uncertain`. Restart is refused with `kill <pid>`. The test "classifies an externally-managed launchd job from the real list output" is fed a list that real non-root `launchctl list` does not produce. Fix: build the pid→label map from `launchctl print system` and `gui/<uid>`, and fix the test fixture.

2. **`none` conflates "RepoOS-managed" with "unsupervised"** (`detectDarwinSupervisor` and `detectLinuxSupervisor` both return `none` for `MANAGED_LABEL_RE`; `classifyRestartPath` in `server-restart.ts` then falls through to `hand-run`). If the registry entry is missing or `getServiceStatus` is not `running` while the `com.repoos.serve.*` job is alive, the server gets SIGTERM, KeepAlive respawns it, and a second `repoos serve` is spawned on the same port. Fix: return a distinct `managed` kind and route it to the managed-service path or refuse.

3. **Pid is trusted when `/api/health` answers** (`src/core/server-locate.ts`, `locateRepoServer`: `if (!healthOk && !verifyPidServesRepo(...)) continue`; `src/core/server-restart.ts`, `restartRepoServer`: `if (!healthForRoot && !verifyPid(...))`). `/api/health` returns no pid, so it cannot vouch for `lock.pid`. A stale lock whose pid was recycled by another process of the same user, while some server answers on that port for this root, leads to SIGTERM on an unrelated process. Fix: always run `verifyPidServesRepo` before signalling.

## Edge cases
- Landing preflight: `work/1074` and `work/1096` conflict with main, and the branch carries bookkeeping for six other tasks. These are bookkeeping, not source, but the task cannot land until they are healed.
- No bare `node`/`npm`/`npx` added.
- #0214 adoption: the warning and `user-docs/cli.md` claim that restarts adopt in-flight agents. The server adoption code is visible (`adoptRunningAgents`, `server.ts` ~2211), but the report does not cite it or show that SIGTERM preserves agents.
- The `uncertain` manual command is `kill <pid>`, which stops the server and does not restart it. Once detection covers the system domain, print the real `launchctl kickstart` command.

## Suggestions
- `src/commands/serve.ts:262–264` appends `--quiet` / `--no-tailscale-https` even when `args` already has them, so the lock stores duplicates. Replay is harmless; dedupe anyway.
- Add a test fed with real `launchctl print system` output, plus a managed-label-without-registry case.
- Unrelated `repoos landable` quirk (Bugs-section bullets counted as blocking): split it into its own task.

## Could not verify (environment)
- A real non-sudo KeepAlive LaunchDaemon respawn (timing and kickstart without root). This needs the reporter's box or a held human step.

## Verdict
`needs some work` — the reported Kamrai case (system-domain LaunchDaemon, KeepAlive) is never detected, so `repoos restart` refuses it instead of restarting it.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

