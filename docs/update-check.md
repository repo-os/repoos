# Passive RepoOS release update check (#1072)

RepoOS may tell users when a newer release is on GitHub without requiring them to
run `repoos upgrade` or open the dashboard first.

## Surfaces

| Surface | Behaviour |
| --- | --- |
| **CLI** | One line on **stderr** after an interactive command finishes, at most once per 24h |
| **Dashboard** | Existing `ReleaseUpdateNotification` banner/dialog (`GET /api/release/available`) |

Both use the same GitHub lookup as `repoos upgrade` (`fetchLatestRelease` in
`src/commands/upgrade.ts`) and the same install detection as the upgrade dialog
(`upgradeInstruction`).

## Telemetry

There is **no** analytics or background polling beyond a single anonymous
`GET` to the public GitHub releases API (same as `repoos upgrade`). No secrets
are sent. The cache file lives only on the user’s machine.

## Cache

Path: `~/.repoos/release-update-cache.json` (machine state dir via
`machineStateDir()`).

Fields:

- `lastCheckedAt` — unix ms; network refresh at most once per **24 hours** on
  success. After a **generic** failure (offline, DNS, timeout, 5xx) the retry
  backoff is **60 seconds** (mirrors the server’s in-memory failure cache).
  After a **rate-limit** response (**403/429**) it backs off for **24 hours**
  (or a `Retry-After` value when GitHub sends one), because unauthenticated
  GitHub allows only 60 requests/hour per IP and a 60s retry would keep the
  quota exhausted
- `latestVersion`, `url` — last successful lookup (preserved across failures)
- `channel` — install channel the row was fetched for (`""` = stable `latest`).
  A row whose `channel` does not match the running install is ignored on read
  (a beta install and a stable install do not share a `latestVersion`)
- `fetchSucceeded` — `false` after offline/timeout/403/429
- `retryNotBefore` — unix ms before which a failed refresh must not be retried
  (set on a rate-limit response; absent for generic failures)
- `refreshingSince` — unix ms when a detached refresh child was last spawned;
  suppresses parallel spawns (several commands at once, or offline retries) for
  up to **60 seconds**, and is cleared when the child writes
- `dismissedVersion` — reserved for cross-surface dismissal (dashboard uses
  `localStorage` today; #1073 owns dismissal UX)
- `lastNoticeAt` — when the CLI last printed its stderr line

The detached refresh child owns `lastCheckedAt`, `latestVersion`, `url`,
`channel`, `fetchSucceeded` and `retryNotBefore`; the parent’s exit hook owns
`lastNoticeAt`. Writes re-read the file first and merge, so a notice the parent
printed while the child’s GET was in flight is not lost (and vice-versa).

**Why 24h?** Frequent checks would add noise and repeat GitHub traffic on every
command; once per day is enough for a passive reminder and matches the CLI
notice throttle.

## When checks run

**On** by default (`updates.check = true` in `repoos.toml` / Settings).

**Off** when:

- `updates.check = false`
- `REPOOS_NO_UPDATE_CHECK=1` or `REPOOS_DISABLE_UPDATE_CHECK=1`
- CI (`CI=true`, `GITHUB_ACTIONS`, …)
- Non-TTY stdout/stderr or `--json` (script-friendly commands)
- `repoos upgrade`, `serve`, `version`, `help`, `api`
- Source checkout (`isSourceCheckout`) — avoids misleading “update available”
  when the tree is ahead of the latest tag

Channel installs compare against their channel; stable installs use
`releases/latest` (stable only).

## Implementation

- Core: `src/core/update-check.ts`, semver helpers in `src/core/release-version.ts`
- CLI hook: `beginCliUpdateBackgroundRefresh` / `registerCliUpdateNoticeExitHook`
  in `src/cli/index.ts` — a **detached** `__update-check-refresh` child refetches
  when the cache is stale while the command runs; the parent prints a cache-only
  stderr line on `exit` and never holds an in-flight GitHub GET
- Server: `fetchAvailableRelease` in `src/server/routes/release.ts` respects
  `updates.check`
