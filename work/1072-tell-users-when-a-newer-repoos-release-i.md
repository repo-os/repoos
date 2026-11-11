---
id: "1072"
title: Tell users when a newer RepoOS release is available (CLI notice + dashboard banner)
type: feature
status: active
priority: p2
area: [cli, server, web]
depends_on: ["1073"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/tell-users-when-a-newer-repoos-release-i
cli_override: opencode
model_override: deepinfra/deepseek-ai/DeepSeek-V4.1-Flash
created_at: "2026-11-09T05:34:00Z"
updated_at: "2026-11-11T04:55:12Z"
review_rounds: 1
review_passes: 1
dev_error_count: 3
engineer_crash_log: "[{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-11T04:21:52.567Z\",\"kind\":\"dev-error\"}]"
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
- 2026-11-11T02:04:15Z · status ready→active, branch
- 2026-11-11T02:14:44Z · message_queued at 2026-11-11T02:14:44.057Z
- 2026-11-11T02:14:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T02:19:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T02:28:55Z · body
- 2026-11-11T02:28:59Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-11-11T02:28:59Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-11-11T02:29:00Z · needs_input
- 2026-11-11T02:29:00Z · message_delivered: 1 message(s)
- 2026-11-11T02:46:17Z · body
- 2026-11-11T02:59:07Z · body
- 2026-11-11T03:14:44Z · message_queued at 2026-11-11T03:14:44.098Z
- 2026-11-11T03:14:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T03:15:44Z · body
- 2026-11-11T03:19:31Z · note: ui verification passed: 1 shot captured with clean console (1 shot warning)
- 2026-11-11T03:19:32Z · message_queued at 2026-11-11T03:19:32.154Z
- 2026-11-11T03:19:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T03:24:45Z · message_delivered: 1 message(s)
- 2026-11-11T03:24:45Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-11T03:35:16Z · body
- 2026-11-11T03:36:35Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-11-11T03:36:35Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-11-11T03:36:36Z · needs_input
- 2026-11-11T03:41:58Z · note: adopted orphaned engineer pid 33890
- 2026-11-11T03:52:42Z · body
- 2026-11-11T03:56:57Z · CTO nudge: held — handoff gate is running
- 2026-11-11T04:06:09Z · note: ui verification passed: 1 shot captured with clean console (1 shot warning)
- 2026-11-11T04:06:10Z · status active→review
- 2026-11-11T04:06:10Z · message_queued at 2026-11-11T04:06:10.392Z
- 2026-11-11T04:07:43Z · note: review pass 1: needs some work
- 2026-11-11T04:07:43Z · message_delivered: 1 message(s)
- 2026-11-11T04:07:43Z · status review→active
- 2026-11-11T04:07:46Z · CTO nudge: held — remote validation is running
- 2026-11-11T04:16:57Z · message_queued at 2026-11-11T04:16:57.844Z
- 2026-11-11T04:16:57Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T04:17:27Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T04:21:52Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-11-11T04:21:52Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-11-11T04:21:55Z · needs_input
- 2026-11-11T04:21:55Z · message_delivered: 1 message(s)
- 2026-11-11T04:48:10Z · cli_override, model_override
- 2026-11-11T04:48:19Z · message_queued at 2026-11-11T04:48:19.335Z
- 2026-11-11T04:48:22Z · engineer stopped by request
- 2026-11-11T04:48:23Z · note: handoff requested (cli)
- 2026-11-11T04:50:15Z · cli_override, model_override
- 2026-11-11T04:50:16Z · model_override
- 2026-11-11T04:55:12Z · body
