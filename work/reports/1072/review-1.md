---
task: "1072"
pass: 1
at: "2026-11-11T04:07:43.636Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/tell-users-when-a-newer-repoos-release-i
state: ok
tree_identity: "58c2d889f:173de5958"
---
## Verdict
needs some work — Failed checks are never cached, the exit-time wait does nothing as designed, the cache ignores channel, and the required fake-TTY tests are missing.

## Relevance
still relevant — The gap is real: nothing on main prints a CLI notice, and #1073's `upgradeInstruction`/`installKind` are already on main, so the dependency is met.

## Evidence
None. The one capture (`default-1.png`, tree 173de5958) renders the Control page with the existing "RepoOS 0.5.82 is ready" banner and no visual defects. Criteria 3 and 7 are superseded, so no toggle-off shot is required.

## Bugs
1. **Failure path is not cached** (`src/core/update-check.ts`, `refreshUpdateCheckCache` catch and `checkForRepoosUpdate`). Offline, timeout, 403 and 429 all return without writing `lastCheckedAt`. Every interactive command re-fetches and holds exit for up to 1.5s until the GET finishes or aborts. This breaks "cached" and "never slows" for the rate-limited case. The server path already has a failure cache (`RELEASE_FAILURE_CACHE_MS` in `src/server/routes/release.ts`), so mirror it.
2. **Exit-time wait does not do what its comments say** (`waitForPrefetch`, `emitCliUpdateNoticeOnExit`; lifecycle/teardown ordering). `exit` fires only after the event loop drains, so `prefetchPromise` has already settled and the spin returns at once. I checked this with a Bun probe in the scratchpad: 0ms wait, promise already resolved. The real cost is that the in-flight GET delays process exit, and the doc comment ("may block up to ~1.5s") is wrong. The same fire-and-forget pattern is in `prefetchCliUpdateCheck`. Pick one behaviour: await the prefetch explicitly, or never wait and show the notice on the next run.
3. **Shared cache is not keyed by channel** (`emitCliUpdateNoticeOnExit`, `checkForRepoosUpdate`, `refreshUpdateCheckCache`). `latestVersion` is trusted without checking the channel it was fetched on. A beta user who switches to stable within 24h is told about `v0.5.83-beta.2`, which `repoos upgrade` on stable will not install. Store the channel in the cache and ignore it on mismatch.
4. **Missing required tests** (`src/core/update-check.test.ts`; criterion 2). There is no fake-TTY test. The "fails soft on network errors and rate limits" test (line 142) asserts only `null`, so it cannot catch bug 1. The "ahead of latest" and opt-out cases are not exercised through the exit hook.

## Edge cases
- `CLI_UPDATE_SKIP_COMMANDS` skips help, version, upgrade and serve only. Script-consumed commands such as `repoos api` still get the stderr line when stderr is a TTY.
- `dismissedVersion` is written but never read by the CLI. Dashboard dismissal lives in localStorage (`DISMISSED_KEY`), so dismissing on the dashboard does not silence the CLI. #1073 owns this.
- Could not verify: whether `ctx.config` on the server reflects a Settings toggle switched back on without a restart. The UI gate only hides the banner in the off direction.
- `isNewerVersion` ignores the prerelease label. That is fine within one channel but wrong across labels.

## Suggestions
- Remove `checkForRepoosUpdate`, which has no non-test caller. Also drop the unreachable `!cache` branch in `noticeAllowed` and the redundant `cache?.` calls.
- Delete `sleepSync`/`waitForPrefetch` when fixing bug 2.
- No bare `node`, `npm` or `npx` was added.

## Verdict
needs some work — Failed checks are uncached and the exit wait is a no-op; the cache ignores channel; fake-TTY tests are missing.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T04:06:00.860Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

