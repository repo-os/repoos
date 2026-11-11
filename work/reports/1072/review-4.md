---
task: "1072"
pass: 4
at: "2026-11-11T09:05:18.290Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/tell-users-when-a-newer-repoos-release-i
state: ok
tree_identity: "af27c4869:af27c4869"
---
## Verdict
`good to go`. Code is sound and the round-3 fixes hold. EVIDENCE-GAP-ONLY: the banner shot is covered by the open Upgrade dialog.

## Relevance
`still relevant`. The CLI notice is absent on main, and #1073 has landed, so the install-kind and command helpers this task reuses now exist.

## Evidence
- `default-1.png` (route `/`, state `release:updateAvailable`, highlight `.release-update-banner`): the capture is from the reviewed implementation commit `af27c4869`, not stale. The Upgrade dialog opens over the page and its scrim covers the highlighted banner, leaving only the top strip "RepoOS 0.6.0 is ready" visible. Re-capture with the dialog closed if a clear banner shot is wanted. The hide-when-off gate is covered by `releases.test.ts`, not by a shot.

## Bugs
None found.

Round-3 items, verified fixed:
- Retry-After is wired. `githubApiError` in `src/commands/upgrade.ts` builds a typed `UpdateCheckFetchError`, and `update-check.test.ts:350` covers it.
- Cache write is atomic. `writeUpdateCheckCache` writes a temp file and renames it (`update-check.ts:132`).

Checked for the same class: `markRefreshSpawned` and `emitCliUpdateNoticeOnExit` still read then write, as already accepted. No other shared-file writer was found.

## Edge cases
- `writeUpdateCheckCache` leaves `<path>.<pid>.tmp` behind if `renameSync` throws. The error is swallowed, and the next write from the same pid overwrites the file.
- The first notice appears on the run after the detached child writes the cache, by design.
- No test drives a real 429 through `fetchLatestRelease` into `refreshUpdateCheckCache`. `update-check.test.ts:369` uses a hand-built error. The wiring reads correctly.
- The CLI hook only registers after the dispatch switch. I found no early `return` inside it, so every dispatched command reaches the exit hook.
- No bare `node`, `npm` or `npx` was added. The child uses `process.execPath` with `process.argv[1]`, the same pattern as `runtime.ts`.

## Suggestions
- The dashboard route `getAvailableRelease` in `src/server/routes/release.ts` keeps its 60s failure cache. During a GitHub rate limit it retries every minute, the quota pattern the CLI's 24h backoff exists to avoid. It predates this branch, so it is not blocking.
- `upgrade.ts` now imports `UpdateCheckFetchError` from `update-check.ts`, which imports `upgrade.ts`. The cycle is safe today because both sides are used only inside functions. Moving the class into a leaf module would remove it.
- Follow-ups already accepted in the task body still stand: one spawn per command with no lock, the second `loadConfig` parse on every command, `REPOOS_DISABLE_UPDATE_CHECK` missing from the environment docs, prerelease-label ordering, and the read-then-write windows.
- `repoos driver brief` is agent-read but not in the skip list. The stdout-TTY gate covers pipes, so this is low priority.

## Could not verify (environment)
- I did not re-run `merge-tree`, tests or the build. The server's landing checklist says only the task file conflicts with main, and close-out takes main's copy.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T09:02:56.076Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

