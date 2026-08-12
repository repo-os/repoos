---
id: "0134"
title: Add optional ntfy notification support
type: feature
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-12T11:13:43Z"
updated_at: "2026-08-12T11:14:07Z"
---
## Problem

RepoOS currently has no push notification mechanism for task lifecycle events. Users who want to know when a task moves from `active` to `review`, when review is complete and ready to merge, or when a review flags issues must actively poll the UI or CLI. This is especially painful on mobile where there is no persistent dashboard open.

## Desired UX

- In the settings page, a new "ntfy Notifications" section appears, styled similarly to the existing Cloudflare settings section.
- The section includes a side panel or info block that explains what ntfy is, how to install the ntfy app on desktop or mobile, and how to set up a subscription topic.
- The user provides a **subscription topic** string (e.g. `repoos_myproject`) in a text input. This is the ntfy topic to which RepoOS will publish events.
- A toggle switch controls whether ntfy notifications are enabled. When off, no notifications are sent even if a topic is configured.
- When enabled, RepoOS publishes lightweight notification messages to the configured ntfy topic for key task lifecycle events:
  - Task `<name>` moved from `active` to `review`
  - Task `<name>` moved from `review` to `done` (review approved)
  - Task `<name>` review returned with issues (moved from `review` back to `active` or a new status like `changes-requested`)
  - (Stretch, if clean to implement) Task `<name>` created
- Settings are persisted in the repo's config (same mechanism as other settings). The topic string and enabled toggle survive restarts.

## Acceptance criteria

- [ ] Settings page renders an "ntfy Notifications" section with a side panel explaining ntfy and linking to install instructions.
- [ ] A text input accepts a subscription topic string and persists it.
- [ ] A toggle enables/disables ntfy notifications; persisted independently of the topic string.
- [ ] When enabled, task status transitions (`active` → `review`, `review` → `done`, `review` → `active`/changes-requested) trigger a POST to `https://ntfy.sh/<topic>` with a human-readable message body.
- [ ] Notification sending is best-effort: failures (network error, bad topic) are silently ignored and do not affect the transition itself.
- [ ] The ntfy base URL defaults to `https://ntfy.sh` and is configurable (hidden/defaulted in the settings UI; a `NTFY_BASE_URL` env var or config key suffices for self-hosted ntfy instances).
- [ ] No external runtime dependencies are added.

## Notes for AI

- Use the existing settings UI patterns from the Cloudflare section as a reference for layout, side panel, toggle, and persistence.
- ntfy notifications are fire-and-forget HTTP POSTs to `https://ntfy.sh/<topic>`. The body is plain text; no authentication is assumed in this initial version.
- Notification sending must be non-blocking (fire-and-forget, promises not awaited into the control flow of the task transition).
- If the topic string is empty or the toggle is off, never send.
- Do NOT add a runtime dependency. Use Node's built-in `fetch` or Bun's native fetch.
- Files likely to touch:
  - `src/ui-app/` — settings page component (add the ntfy section)
  - Settings persistence layer (wherever Cloudflare settings are stored)
  - Task transition logic (where status changes happen) — to emit notifications
- The ntfy logo/branding should not be used unless it has a permissive license. Use a generic bell icon or plain text instead.
- The side panel content should include a sentence like: "ntfy is a free, open-source push notification service. Install the ntfy app on your phone from the App Store or Google Play, subscribe to a unique topic (e.g. `repoos_myproject`), and enter that topic below."

## Scope

In scope:
- UI section in settings
- Topic input + enable toggle
- Publishing to a public ntfy.sh topic on task status changes
- Configurable base URL for self-hosted ntfy

Deferred / out of scope:
- ntfy authentication (username/password or access tokens)
- Per-event notification opt-in/opt-out (all events or none for now)
- Notification priority levels
- Attachments, click actions, or rich formatting
- Custom notification templates
- CLI-only notification delivery
- Testing the integration beyond a basic smoke check (no real ntfy endpoint in tests)

## Activity

- 2026-08-12T11:13:43Z · created · unknown
- 2026-08-12T11:14:07Z · status inbox→ready
