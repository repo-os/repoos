---
task: "1072"
pass: 3
at: "2026-11-11T08:37:49.012Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/tell-users-when-a-newer-repoos-release-i
state: ok
tree_identity: "b9da1565b:39556fd0c4"
---
## Verdict
`needs some work` — The four frozen fixes are in, but a documented Retry-After path is dead code and the cache write can still lose the notice stamp.

## Relevance
`still relevant` — The CLI stderr notice is absent on main, and the #1073 dependency has landed (`upgradeInstruction` and `installKind` are used here).

## Evidence
`default-1.png` (declared shot, route `/`, state `release:updateAvailable`) matched its route and rendered the state, but the Upgrade dialog is open over the Control page. The scrim covers the banner that `.release-update-banner` highlights, so the banner is barely visible. Re-capture on the final tree with the dialog closed. This is not a code defect.

## Bugs
1. **Retry-After is documented but unreachable** (class: documented behaviour not wired). `UpdateCheckFetchError` (`src/core/update-check.ts` ~L189) is never constructed. `fetchLatestRelease` (`src/commands/upgrade.ts` L225, L230) throws a plain `Error("GitHub API returned <status>")` with no headers, so `retryAfterMs` is always null and every 403/429 gets the 24h fallback. The fallback is safe. The wrong parts are `docs/update-check.md` L33–35 ("or a `Retry-After` value when GitHub sends one"), the JSDoc at `update-check.ts` L36 and L63, and the test at `update-check.test.ts` L350, which passes only on a hand-built error. Fix: delete the Retry-After branch and its test and document the 24h backoff. Or wire the header through `fetchLatestRelease`.
2. **Residual lost update on the shared cache** (same class as freeze item 1). `writeUpdateCheckCache` (`update-check.ts` ~L140) calls `writeFileSync` directly, which truncates first. A concurrent reader can see an empty file, so `readUpdateCheckCache` returns null. `mergeUpdateCheckCache` (~L255) then writes `lastNoticeAt: undefined`, which drops the parent's stamp and can re-print within 24h. The same read-then-write pattern appears in `markRefreshSpawned` (~L266) and `emitCliUpdateNoticeOnExit` (~L520). Fix: write a temp file and `renameSync` it into place.

## Edge cases
- `ctx.config` liveness: `getAvailableRelease` gates on `ctx.config`. I could not find where `ctx.config` refreshes after a Settings save, so turning the toggle back on may not reach `/api/release/available` until restart. The UI gate only hides in the off direction.
- `updates.check` lives in repoos.toml, but the throttle is per machine. A repo with the toggle off does not silence notices from another repo.
- First run: with no cache file, `markRefreshSpawned` is a no-op, so parallel first commands each spawn a child.
- The skip list is by command name only. Stdout-TTY scripts that merge stderr (`2>&1`) can receive the line.

## Suggestions
- `dismissedVersion` is never written anywhere, not just unread. The merge preserves a field that is always null. This belongs to #1073.
- Freeze follow-ups stand as written: one spawn per eligible command, no `loadConfig` memo, `REPOOS_DISABLE_UPDATE_CHECK` not in `user-docs/environment-and-secrets.md`, and prerelease ordering.
- No bare `node`, `npm` or `npx` invocations were added. `process.execPath` is used for the child.

## Could not verify (environment)
- I ran `git merge-tree --write-tree main HEAD` once, against the brief, and it exited 1. That fits the server's task-file-only WARN, but I did not inspect the conflicted path list.
- I did not run tests or the build, per the gate instructions.

## Verdict
`needs some work` — Retry-After is documented but dead, and the cache write can still drop the notice stamp; both fixes are small.

## Automated verification
Server-appended, not re-verified here.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T08:35:59.797Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

