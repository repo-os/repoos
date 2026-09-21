---
id: "0474"
title: Design and implement revocable RepoOS Hub read capabilities and summary API
type: feature
status: review
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "2026-09-21T14:02:58.619784Z  WARN codex_core::agents_md: project doc exceeds remaining budget; truncating path=file:///Users/nick/code/nick/repoos-worktrees/feat/design-and-implement-revocable-repoos-hu/AGENTS.md remaining_bytes=32768"
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/design-and-implement-revocable-repoos-hu
cli_override: cursor
created_at: "2026-09-21T11:50:27Z"
updated_at: "2026-09-21T18:16:32Z"
review_passes: 2
handoff_signal_retry_count: 1
dev_error_count: 1
---
Enable a trusted native Hub to read small authenticated summaries from multiple RepoOS servers without scraping WebViews or exposing native privileges to server pages.

Acceptance criteria:
- Define an explicit, user-created, revocable, read-only Hub device capability/token model; never reuse or extract browser cookies.
- Store a Hub token in the macOS Keychain and transmit it only to its bound HTTPS origin.
- Add a versioned, compact authenticated server summary endpoint returning only agreed attention counts and freshness metadata, such as active agents, review-ready tasks, needs-input tasks, and last activity.
- Enforce least privilege, expiry/revocation/rotation behavior, audit-safe logs, rate limits, and no token exposure to the browser UI.
- The API contract is usable by future native clients without creating a central RepoOS account or server discovery service.
- Add server-side auth/authorization tests and end-to-end contract coverage.
- Update relevant user/admin docs for creating and revoking a Hub device capability.

Depends on the macOS Hub architecture task. This task is intentionally independent of the WebKit shell implementation so its API can be reviewed carefully.

## Activity

- 2026-09-21T11:50:27Z · created · unknown
- 2026-09-21T11:52:36Z · body
- 2026-09-21T12:09:17Z · status inbox→ready
- 2026-09-21T13:24:24Z · cli_override
- 2026-09-21T13:24:30Z · model_override
- 2026-09-21T13:24:33Z · status ready→active, branch
- 2026-09-21T14:02:57Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-21T15:09:07Z · status active→review
- 2026-09-21T15:09:08Z · agent exited with an error (codex) · 2026-09-21T14:02:58.619784Z  WARN codex_core::agents_md: project doc exceeds remaining budget; truncating path=file:///Users/nick/code/nick/repoos-worktrees/feat/design-and-implement-revocable-repoos-hu/AGENTS.md remaining_bytes=32768
- 2026-09-21T18:16:32Z · cli_override, model_override
