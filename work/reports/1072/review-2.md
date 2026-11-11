---
task: "1072"
pass: 2
at: "2026-11-11T05:00:49.779Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/tell-users-when-a-newer-repoos-release-i
state: ok
tree_identity: "6441c9ded:6441c9ded5"
---
## Verdict
`needs some work` — The fixes from pass 1 hold, but the cache race breaks the once-per-24h throttle, and unhandled spawn errors and unguarded hooks can break a user's command.

## Relevance
`still relevant` — The CLI stderr notice is still absent on main, #1073 has merged, and the dependency is met.

## Evidence
None. The handoff capture (`default-1.png`, tree 6441c9ded) renders the existing banner over the Control page with no visual defect. The reviewed HEAD differs only in bookkeeping. Criteria 3 and 7 are superseded, so no toggle-off shot is required.

## Bugs
1. **Lost update on the shared cache file** (`src/core/update-check.ts`, `refreshUpdateCheckCache`, success branch `lastNoticeAt: prev?.lastNoticeAt` and catch branch `keepPrior?.lastNoticeAt`). The detached child reads `prev` before its GET. The parent prints and writes `lastNoticeAt` at exit, and the child then overwrites it with the stale value. The next command prints again, so the once-per-24h throttle fails. Same class for `dismissedVersion` in both branches. Fix: re-read immediately before writing, or merge only the fields the child owns.
2. **Unhandled spawn errors** (`spawnDetachedUpdateCheckRefresh`, `update-check.ts` ~L262). There is no `child.on("error")`. An async ENOENT/EACCES emits an unhandled `error` event that crashes the user's command. A synchronous throw from `spawn` is also uncaught.
3. **Passive hooks are not contained** (class: must-never-break hook). `beginCliUpdateBackgroundRefresh` (`src/cli/index.ts` ~L154), `registerCliUpdateNoticeExitHook` (~L482) and `prefetchCliUpdateCheck` (`releaseFromInstall`, `updateCheckCachePath`, `readInstallVersion`) have no try/catch. Only `emitCliUpdateNoticeOnExit` is wrapped. Any throw here fails the command.
4. **Rate-limit backoff is too short** (`UPDATE_CHECK_FAILURE_CACHE_MS`, used by `shouldRefreshUpdateCheckCache`). Offline, timeout, 403 and 429 all retry every 60s. Unauthenticated GitHub allows 60 requests/hour per IP, so a rate-limited user's CLI keeps the quota exhausted. The spec asks for a 24h TTL. Back off much longer on 403/429, for example by honouring `Retry-After`. Update `docs/update-check.md`, which says "60 seconds after a failed GET".

## Edge cases
- Every eligible command with a stale cache spawns a full `repoos` child, which loads the whole CLI module graph. Offline users spawn one about every minute. There is no lock, so parallel commands can spawn several children.
- `loadConfig()` is not memoized, and the new hook calls it once more per command. Any `console.warn` on bad config (`config.ts` ~L837–905) may now print twice. I did not confirm which function those warnings sit in.
- Dashboard dismissal lives in localStorage. `dismissedVersion` is written but never read, so the CLI keeps nagging after a dashboard dismissal. This belongs to #1073.
- `REPOOS_DISABLE_UPDATE_CHECK` is accepted but documented only in `docs/update-check.md`, not in `user-docs/environment-and-secrets.md`.

## Suggestions
- Add regression tests for the `lastNoticeAt` race and for `child.on("error")`. The current tests inject `spawnDetachedRefresh`, so they never reach the real spawn path.
- Skip the spawn when a fresh refresh is already in flight, using a small lock file or a `refreshingSince` timestamp.

## Could not verify (environment)
I did not run tests or the build, per the gate instructions. The merge preflight is server-computed and reports only the task file as a conflict.

## Verdict
`needs some work` — Cache race breaks the 24h throttle, unhandled spawn 'error' and unguarded hooks can break commands, and 60s rate-limit backoff exhausts GitHub's quota.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T04:59:03.992Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

