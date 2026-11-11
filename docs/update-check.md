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

- `lastCheckedAt` — unix ms; network refresh at most once per **24 hours**
- `latestVersion`, `url` — last successful lookup
- `dismissedVersion` — reserved for cross-surface dismissal (dashboard uses
  `localStorage` today; #1073 owns dismissal UX)
- `lastNoticeAt` — when the CLI last printed its stderr line

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
- `repoos upgrade`, `serve`, `version`, `help`
- Source checkout (`isSourceCheckout`) — avoids misleading “update available”
  when the tree is ahead of the latest tag

Channel installs compare against their channel; stable installs use
`releases/latest` (stable only).

## Implementation

- Core: `src/core/update-check.ts`, semver helpers in `src/core/release-version.ts`
- CLI hook: `registerCliUpdateNoticeHook` in `src/cli/index.ts` (prefetch +
  synchronous `exit` handler)
- Server: `fetchAvailableRelease` in `src/server/routes/release.ts` respects
  `updates.check`
