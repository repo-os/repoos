---
task: "1091"
pass: 6
at: "2026-11-11T22:21:04.231Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/repoos-restart-restart-the-running-serve
state: ok
tree_identity: "bbcd31cc4:"
---
Repeated review classes: the recurring pattern is pid and supervisor detection getting refined one pass at a time. Pass 5's down-state hint, the duplicated `dist/` path and the in-flight warning are fixed. The restart-vs-start hint and the doc/code drift in the refusal text are the classes that keep coming back. A human should look at the detection design rather than keep patching it per pass.

## Verdict
`needs some work` — `repoos restart` cannot find a server whose command line does not embed this repo's root, so a project repo on an installed RepoOS (the Kamrai case) gets "No running RepoOS server found" while `repoos status` shows it running.

## Relevance
`still relevant` — no CLI restart path exists on main for hand-run or supervised servers, and the Kamrai case is still unaddressed there.

## Evidence
None

## Bugs
**Class: a pid check that is stricter than the lockfile lookup it guards.** One blocking instance, with siblings in the same locator.

- `src/core/serve-pid-verify.ts:verifyPidServesRepo` calls `parseServeRoot` (`src/server/system.ts:454`), which takes the root to be the directory above `dist/cli/index.js`. For an installed RepoOS (for example `…/node_modules/repoos/dist/cli/index.js serve`) that yields the install directory, not the project. The check then returns false.
- The same false result hits every caller: `locateRepoServer` (`src/core/server-locate.ts`, both the lockfile and registry branches) and `restartRepoServer` (`src/core/server-restart.ts`, the "Refusing to signal" branch). Locate returns null, so the user gets "No running RepoOS server found".
- `repoos stop` (`src/commands/stop.ts:40-60`) trusts the repo's own lock and never checks argv. Acceptance criterion 1 asks for the same lookup as `stop`, so this is a parity break.
- A server launched by a bare `repoos serve` shim, without `cli/index.js` in argv, fails `isOrphanServeCommand` as well.
- Fix in one place: keep the lock as the ownership proof (it lives under this repo's cache dir) and guard against pid reuse with the lock's `startedAt` against the process start time, or record the root in the lock at register time and compare that. Use that in `locateRepoServer`, `restartRepoServer` and `waitForServerRestart`.
- Not verified here: whether the reporter's plist argv hits this path. I did not run `ps` on a live Kamrai server.

## Edge cases
- `detectDarwinSupervisor` (`src/core/supervisor-detect.ts`, the `ppid === 1` branch): a hand-run server started with `nohup`, or whose shell exited, is re-parented to launchd and refused as uncertain. Criterion 3 fails for that server, but it fails closed.
- The Kamrai path depends on `launchctl print system` listing pids for a non-root user. That is covered only by fixtures; it is unverified live.
- `user-docs/troubleshooting.md` ("Supervisor RepoOS didn't install") says the refusal's manual command "stops the pid and then starts `repoos serve` again". The code now prints a single `kill <pid>` step with the start command only as a fallback. Non-blocking, but it contradicts the code.
- The engineering report's "Generated change summary" lists about 100 files that are not in this branch's diff (release-email, markdown-fence, and so on). It cannot be taken as evidence for this diff. The landing checklist (35 files, all in scope) is the reliable source.

## Suggestions (non-blocking)
- `src/core/doctor.ts:1940` still says `repoos stop` then `repoos serve`; point it at `repoos restart` once the lookup is fixed.
- `src/commands/status.ts:824` (no serve lockfile) still tells the user to "restart `repoos serve`".
- Hand-run respawn uses `stdio: "ignore"`, so logs are lost. Say so in `user-docs/cli.md`, or redirect to a log file.
- `restartHint(_server)` ignores its argument now; simplify it, or keep the argument and drop the underscore.
- `src/commands/restart.ts`: `void cmdRestart(rest)` has no `.catch`; a throw from `loadConfig` or `readServeLocks` becomes an unhandled rejection. Match the other `void cmd…` call sites, or add a catch.

## Verdict
`needs some work` — the locator's argv-root check rejects a server that the lockfile identifies, so restart fails for installed-RepoOS project repos (the Kamrai case).

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

