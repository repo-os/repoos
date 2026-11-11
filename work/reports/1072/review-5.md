---
task: "1072"
pass: 5
at: "2026-11-11T09:22:11.870Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/tell-users-when-a-newer-repoos-release-i
state: ok
tree_identity: "af27c4869:af27c4869"
---
## Verdict
`good to go`. Code is sound and the round-4 fixes hold. The banner shot is covered by the open Upgrade dialog. EVIDENCE-GAP-ONLY

## Relevance
`still relevant`. The CLI notice is new on this branch, and the #1073 install-kind and command helpers it reuses (`upgradeInstruction`) already exist on main.

## Evidence
- `default-1.png` (route `/`, state `release:updateAvailable`, highlight `.release-update-banner`): the route matched and the state rendered, but the Upgrade dialog opens over the page. Its scrim covers the banner, leaving only the top strip "RepoOS 0.6.0 is ready" visible. The capture is from `af27c4869`, and the reviewed HEAD differs only by bookkeeping, so it is not stale. Re-capture with the dialog closed for a clear banner shot. Criterion 7 is superseded by the task correction, so this is not a required visual AC. The hide-when-off gate is covered by `releases.test.ts`.

## Bugs
None found.

Class check, "documented or configured but not wired": `updates.check` is in DEFAULT_CONFIG, the types, `loadConfig`, `getConfigSchema`, and `SUPPORTED_TOML_KEYS`, and it reaches the Settings General tab. `REPOOS_NO_UPDATE_CHECK` is read in the CLI and the server route. `Retry-After` is built by `githubApiError` and tested through the real `fetchLatestRelease` path (`update-check.test.ts:350`). The cache write is temp-then-rename. The exit hook is registered after dispatch, and the only earlier returns are help paths that should not notify. No new bare `node`, `npm` or `npx`: the child uses `process.execPath`.

## Edge cases
- A deterministic "No `<channel>` release found" error is treated as a generic failure. It is retried every 60s while commands run, which is about one GitHub GET per minute per machine.
- If `repoos.toml` fails to parse, `loadConfig()` is caught and `updates.check` defaults to on. A user who opted out in a broken file still gets fetches and notices until the file is fixed.
- Two concurrent exits can both print the notice in the read-then-write window. This is accepted scope.

## Suggestions (non-blocking)
- Pin `env: {}` in the "schedules refresh only for interactive TTY use" test (`update-check.test.ts:513`). Its second call reads the real `process.env`, so under `CI=true` or `REPOOS_NO_UPDATE_CHECK=1` the expectation fails.
- Consider a 24h backoff for the deterministic no-match case above.
- A leftover `<path>.<pid>.tmp` after a failed rename is swallowed and overwritten by that pid's next write. Harmless.
- The `upgrade.ts` ↔ `update-check.ts` import cycle is safe because nothing uses the imports at module top level.
- Accepted-scope items stand as written: one spawn per command with no lock, the second `loadConfig` parse with duplicate warnings, dashboard dismissal not read by the CLI, `REPOOS_DISABLE_UPDATE_CHECK` missing from the environment docs, prerelease ordering, and the read-then-write windows.

## Could not verify (environment)
- I did not re-run tests, the build or `merge-tree`. The server checklist shows only the task file conflicts with main, and close-out takes main's copy.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T09:02:56.076Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

