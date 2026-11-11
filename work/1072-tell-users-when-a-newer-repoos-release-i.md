---
id: "1072"
title: Tell users when a newer RepoOS release is available (CLI notice + dashboard banner)
type: feature
status: ready
priority: p2
area: [cli, server, web]
depends_on: ["1073"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-09T05:34:00Z"
updated_at: "2026-11-11T02:04:14Z"
---
## Problem
Users learn about new RepoOS releases only if they happen to read an announcement. `repoos upgrade` exists but nothing tells a user that a newer version is out: the CLI never checks, and the dashboard doesn't say either. Releases that fix important problems (for example v0.5.79's remote capture fix) can sit uninstalled indefinitely.

## Desired UX
- Any interactive `repoos` command ends with a single quiet line on stderr when a newer stable release exists, for example: `A new RepoOS release is available: v0.5.79 (you have v0.5.78). Run: repoos upgrade   (release notes: <url>)`. At most once per 24 hours per machine, not on every command.
- The running dashboard shows the same fact as a dismissible banner/bell notice with a link to the release notes and the upgrade command; dismissal is remembered for that version.
- The check never slows, blocks or breaks a command: it is cached, runs in the background with a short timeout (about 1.5s), and any network failure is silent.
- Users can turn it off: `REPOOS_NO_UPDATE_CHECK=1`, a setting in Settings (and `repoos.toml`), and it is off automatically in CI, when stdout/stderr is not a TTY, with `--json`, and for commands whose output is parsed by scripts.
- Only stable releases are announced by default; users on a `--channel beta|canary|rc` are notified of newer builds on their own channel.
- Source/dev checkouts (not a standalone curl-installed build) do not nag, and show nothing misleading when their version is ahead of the latest release.

## Acceptance criteria
1. A small `update-check` module: reads/writes a cache file under the user-level RepoOS state dir (`lastCheckedAt`, `latestVersion`, `url`, `dismissedVersion`), fetches `GET https://api.github.com/repos/<repo>/releases/latest` (or the channel list endpoint, reuse `fetchLatestRelease` in `src/commands/upgrade.ts`), 24h TTL, 1.5s timeout, never throws; compares semver correctly including prerelease ordering.
2. The CLI prints the notice at most once per TTL, to stderr, only when interactive (TTY, not CI, no `--json`, not a piped command), after the command's normal output; never during `repoos upgrade` itself. Tests with fake fetch, fake clock and fake TTY: newer available, up to date, ahead of latest, offline, rate-limited (403/429), cache hit, opt-out env, CI, non-TTY, `--json`.
3. The server exposes the update state (`GET /api/update-status` with CLI parity per src/cli/api-route-parity.ts), the dashboard shows a dismissible banner/bell notice, honours the Settings toggle, and respects the per-version dismissal.
4. A user-facing setting (`updates.check`, default on) with a Settings UI control and test, per the AGENTS.md rule for user-facing settings.
5. Zero runtime dependencies; no telemetry beyond the single anonymous GET to GitHub (document this clearly); no secrets.
6. Docs: user-docs (how the notice works, how to turn it off) and docs (design, cache location, why 24h).
7. Declared shot of the dashboard banner via a state fixture.
8. Notifying people who do not run the CLI or dashboard (email, RSS, a changelog page) is a separate task; #1071 covers emailing the team on release.

## Notes for AI
Look at `src/commands/upgrade.ts` (`fetchLatestRelease`, channel handling), `src/cli/index.ts` (command dispatch, where a post-command hook fits), the existing notice/bell system (docs: user-docs/notifications.md) and `GET /api/release*` routes. Respect the standalone-vs-source-checkout distinction already used by `repoos upgrade`. Do not edit repoos.toml. Do not make any network call in tests.

## Correction: what already exists
The dashboard ALREADY shows an update banner and dialog (src/ui-app/src/components/ReleaseUpdateNotification.vue, data from GET /api/release/available). Do NOT build a second dashboard banner or a second update-status route. Scope of this task is the part that is missing: a passive, throttled update notice in the CLI (acceptance criteria 1, 2, 4, 5, 6), reusing the same data source/logic as /api/release/available and fetchLatestRelease in src/commands/upgrade.ts. The dashboard part here is only: honour the new Settings toggle (hide the banner when updates.check is off). Overlap with #1073, which owns the dialog: #1073 owns (a) the upgrade command text and install-kind detection (installKind / upgradeCommand from the server) and (b) remembering the dismissed version. The CLI notice must reuse #1073's install-kind and command helper instead of re-deriving it, so this task depends on #1073 landing first. Criteria 3 and 7 above are superseded by this section.

## Activity

- 2026-11-09T05:34:00Z · created · njachowski@gmail.com
- 2026-11-09T05:50:45Z · body: Correction: what already exists (added)
- 2026-11-09T07:50:32Z · body: Correction: what already exists (added 1, removed 1)
- 2026-11-09T07:50:34Z · depends_on
- 2026-11-11T02:04:13Z · status inbox→ready
- 2026-11-11T02:04:14Z · cli_override, model_override
