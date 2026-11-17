---
task: "1154"
pass: 2
at: "2026-11-17T15:53:50.254Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/update-restart-notice-don-t-suggest-a-la
state: ok
tree_identity: "69955e868:69955e8688"
---
## Verdict
`needs some work` — post-spawn restart failures are silent; the modal locks on "Restarting…" with no reason or fallback command.

## Relevance
`still relevant` — the bogus `launchctl` command and CLI 401 are real, and this branch targets them directly; nothing newer supersedes it.

## Evidence
None

## Bugs
- **Class: restart outcome not surfaced** — `src/server/routes/info.ts` `spawnHandRunRestartHelper` uses `stdio: "ignore"` and resolves `ok` on the `spawn` event, so a `repoos restart --force` that exits non-zero (an `uncertain` supervisor → `classifyRestartPath` refuses, a managed service not running, the replacement server failing to start, a stale `repoos` on PATH) leaves the old server running while the route answers 202 and nothing records why. Instances: the hand-run branch (~line 198), the supervised branch (~228), and the `whenIdle` timer (~220, which logs only spawn failure). The removed `performSupervisedRestart` used to log these failures server-side, so supervision failures are now unobservable too. In `ReleaseUpdateNotification.vue`, `restartAccepted`/`restartPendingAction` stay true until `/api/update-status` reports `restartPending: false`; a failed restart leaves the button disabled at "Restarting…" with no reason and no `repoos restart` fallback, which AC4 requires. Surface the helper's exit/refusal (captured output to a cache file, or pre-classify before spawning) and reset the busy state on a failed attempt.
- **Class: docs/code mismatch** — `user-docs/getting-started.md:135` says the notice "shows a launchd or systemd restart command only for a detected supervisor", but the supervised branch of `ReleaseUpdateNotification.vue` renders no command at all (only Restart now / Restart when idle). Reword or restore a command display.

No further findings of this class were found after grepping: `src/server/routes/info.ts`, `src/server/server.ts`, `src/commands/restart.ts`, `src/core/server-restart.ts`, `src/core/supervisor-detect.ts`, `src/core/server-locate.ts`, `ReleaseUpdateNotification.vue`, `releases.test.ts`, `update-status.test.ts`, `user-docs/getting-started.md`, `user-docs/cli.md`, `docs/architecture.md`.

## Edge cases
- A hand-run POST with `{whenIdle:true}` ignores the flag and restarts immediately (`--force`); only the supervised branch honours waiting.
- A server hand-run from a linked worktree: the helper runs `repoos restart` there, but `cmdRestart` uses `boardRoot()` (the main checkout), so the worktree's serve lock is not found; with the bug above this is silent and stuck.
- An `uncertain` supervisor is reported as hand-run, so the modal promises a restart the CLI then refuses (see above).

## Suggestions
- The hand-run text says "same command and port"; the CLI reconstructs `repoos serve …` from recorded flags, not the literal `just serve`.
- Consider offering "Restart when idle" for hand-run servers too.
- Merge the two `../../core/service-manager.js` imports in `info.ts`.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T15:44:08.873Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

