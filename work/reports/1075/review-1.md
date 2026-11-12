---
task: "1075"
pass: 1
at: "2026-11-12T16:33:34.792Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/tell-the-user-when-an-installed-upgrade-
state: ok
tree_identity: "e397ca8b2:278c0f45a"
---
## Verdict
`needs some work` — UI leaves restart actions latched disabled, idle-restart state is shared across two divergent server paths, and required restart/supervisor tests are missing.

## Relevance
`still relevant` — Post-upgrade version mismatch is real; this extends #1072/#1073 rather than duplicating release polling.

## Evidence
None

## Bugs
- **UI action latch (`restartPendingAction`)** — `ReleaseUpdateNotification.vue`: `restartInstalled` sets `restartPendingAction` true and never clears it, so buttons stay disabled after the first click (including cancel/when-idle).
- **Shared idle timer / divergent idle-restart semantics** — `info.ts`: module-level `idleRestartTimer` / `idleRestartPending` shared by `restart` (`POST /api/server/restart`, idle completion → `ctx.reload?.requestReload`) and `restartInstalledUpgrade` (`POST /api/update-status/restart`, idle completion → `performSupervisedRestart`). Second `whenIdle` only sets the flag when a timer already exists (`if (!idleRestartTimer)`), so the first handler’s callback wins.
- **Poll-failure proceeds to destructive restart** — `commands/restart.ts` `--when-idle`: `catch { break; }` exits the wait loop on any `/api/update-status` failure and still runs `restartRepoServer`, which can restart while work is active.
- **Acceptance criterion 3 tests absent** — No diff tests for `getUpdateStatus`, `restartInstalledUpgrade`, supervised refusal, or fake supervisor/exit; only duplicated `isNewerVersion` coverage (`release-version.test.ts`, `releases.test.ts`). No test for upgrade’s “running server is still …” line.

## Edge cases
Dismiss only re-evaluates on the 3s poll (localStorage not reactive). `repoos restart --when-idle` does not wait on `closeOutLock`. Immediate restart returns 202 before supervised exit; failures are log-only.

## Suggestions
Add `--when-idle` to `help.ts` `flags`. UI test for restart notice and pending/cancel. Fix copy: “1 checks” → “1 check”.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-12T16:32:40.076Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

