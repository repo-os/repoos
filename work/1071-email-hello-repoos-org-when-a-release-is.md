---
handoff_signal_retry_count: 2
id: "1071"
title: "Release emails: any project with email configured can email its team when a release is published"
type: feature
status: active
priority: p2
area: [server, web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/release-emails-any-project-with-email-co
cli_override: claude code
model_override: haiku
created_at: "2026-11-09T04:42:41Z"
updated_at: "2026-11-09T23:40:50Z"
---
## Problem
When a release goes out, the maintainer wants an email to their team (for RepoOS itself: hello@repoos.org) with the release notes and known issues, nicely formatted, so it can be forwarded to users. Today the only signals are the in-app bell notice and the GitHub Release. This should be a general RepoOS feature, not a one-off for this repo: any project that has email set up should be able to turn it on.

## How other projects do this
Common patterns: a final CI step after the publish job (Slack/Discord/email webhook, GitHub Releases subscription or a mailing-list tool), a changelog/announcement tool (Release Drafter, semantic-release plugins), or a chat/RSS feed. They all key off "published", not "tagged". RepoOS already has what's needed: the server sends mail today through the project's `[auth.emailProvider]` (Resend, key via `REPOOS_RESEND_API_KEY`, see docs/native-auth.md), and it already knows when a release is cut (`cutNewRelease`, release notes, `release-history.json`, release notices in the bell).

## Desired UX
- In Settings (and `repoos.toml`), under Releases, a "Release emails" option: on/off, recipient list (comma-separated), and when to send: "when the release is published" (default) or "when it is tagged".
- If the project has no email provider configured, the option explains that and links to the email setup; nothing is sent.
- After a stable release, each recipient gets one email: subject "<project> v<x> is out", HTML body (plain-text alternative included) with version, date, release notes grouped sensibly, links (GitHub release, changelog, upgrade command if `repoos upgrade` applies), and a "Known issues" section. Prereleases (beta/canary/rc) do not email unless a "include prereleases" toggle is on.
- The Releases page shows "Email sent to N recipients" or "Email failed: <reason>" with a Resend button, and a "Send test email" / preview that shows the rendered message without sending to the team.

## Design
- Reuse the existing email provider and sender (`[auth.emailProvider]`); do not add a second mail client or any runtime dependency (zero-runtime-dependency rule). Factor the send function out of auth if needed so both use one code path. Credentials stay in env/.env per docs/api-keys.md; never in repoos.toml, chat or tasks.
- "Published" detection: when `[release].repository` is a GitHub owner/repo, poll the public `GET https://api.github.com/repos/<owner>/<repo>/releases/tags/<tag>` with plain `fetch` (no auth, no GitHub client library) until the release exists with its assets, with a timeout and backoff; when there is no repository or no network, fall back to "send when tagged". A failure to detect never fails the release.
- Idempotent: record the sent email (version, recipients, time, result) in the release record so a restart or retry never double-sends; resend only from the explicit button.
- Not a git hook: git has no post-tag-push hook and a local hook would fire before CI has published anything; the email would announce a version that is not downloadable yet.
- Known issues source: an editable "Known issues" field in the release modal next to the notes (stored in the release record), defaulting to empty, never auto-invented. An empty field renders "None recorded".

## Acceptance criteria
1. `[release.email]` config (enabled, to, when, includePrereleases) with defaults off; Settings UI controls in `getConfigSchema()` and the Releases settings tab, with tests (AGENTS.md rule for user-facing settings).
2. A renderer (`src/server/release-email.ts`) produces subject, HTML and text from the release record; unit tests for escaping, empty notes, no known issues, long notes, prerelease flag. A `--dry-run` / preview endpoint and CLI (`repoos release email --preview <version>` or an `repoos api` route with CLI parity per src/cli/api-route-parity.ts) prints it without sending.
3. Sending uses the shared email provider; provider-missing and send-failure states are surfaced on the Releases page and as a bell notice; failure never fails or reverts the release.
4. Published-detection with tagged fallback, covered by tests using a fake fetch (published, not yet published then published, timeout, no repository).
5. Idempotency and resend covered by tests; no real network or mail in tests (fake provider, fake fetch, fake values for keys).
6. Docs: docs/releases.md and user-docs (how to enable, email provider prerequisite, preview, resend, what the email contains).
7. Verify at least one shot of the Releases page showing the email status row and the settings control (declared `--shots`, state fixture).
8. Everything that does not fit (rich templates, per-recipient unsubscribe, non-GitHub hosts) is filed as a follow-up task, not folded in.

## Notes for AI
Look at `src/server/release.ts`, `src/core/auth.ts` and its email send, `src/core/config.ts` (the `auth.emailProvider` handling and `getConfigSchema()`), `ReleasesView.vue`, `release-history.json`, docs/releases.md, docs/native-auth.md and docs/api-keys.md. Do not send any real email while developing or testing. Do not add credentials anywhere. Do not edit repoos.toml. For RepoOS itself the human enables it afterwards by setting `[release.email]` with to = hello@repoos.org.

## Activity

- 2026-11-09T04:42:41Z · created · njachowski@gmail.com
- 2026-11-09T04:52:36Z · title, body: Problem (added 1, removed 1); How other projects do this (added); Desired UX (added 4, removed 1); Design (added); Acceptance criteria (added 8, removed 7); Notes for AI (added 1, removed 1); Design note (why not a git hook) (removed)
- 2026-11-09T04:52:39Z · area
- 2026-11-09T20:00:26Z · status inbox→ready
- 2026-11-09T23:27:41Z · cli_override, model_override
- 2026-11-09T23:27:46Z · status ready→active, branch
- 2026-11-09T23:33:02Z · message_queued at 2026-11-09T23:33:02.755Z
- 2026-11-09T23:35:40Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T23:40:50Z · message_queued at 2026-11-09T23:40:50.363Z

