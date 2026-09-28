---
id: "0537"
title: Add a notification provider registry and the Telegram notification provider
type: feature
status: review
priority: p1
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: feat/add-a-notification-provider-registry-and
created_at: "2026-09-27T07:33:00Z"
updated_at: "2026-09-28T01:18:16Z"
---
## Problem

Story #0003 says "Create a Telegram notification provider alongside the existing notification system." There is no existing system to sit alongside — **ntfy is a hardcoded set of free functions with no interface and no registry**, so Telegram has no seam to plug into and every call site would have to be rewritten by hand.

`src/server/ntfy.ts` is 157 lines of module-level functions: `shouldSend`, `publish`, `notifyStatusChange`, `notifyTaskCreated`, `notifyNeedsInput`, `notificationForStatusChange`, `formatNotification`. Config is three flat scalars — `ntfyEnabled`, `ntfyTopic`, `ntfyBaseUrl` (`src/core/types.ts:353`), one global topic per repo. Call sites are wired in `src/server/server.ts` (imports at `:183-184`, attached to the index stream at `:2009`) and `src/server/routes/notify.ts`.

Two properties of the existing code must survive the refactor:

- **Fire-and-forget.** `publish` does `void fetch(...)` and only `console.error`s failures. The doc comment states the intent: a network error "must never block or fail the status transition." A Telegram outage must not be able to fail a task transition either. This is the single most important invariant to keep.
- **`NotificationSpec` + `formatNotification` as the shared shape**, so a message's content is built once and rendered per provider rather than duplicated per provider.

## What to build

- A `NotificationProvider` interface, with ntfy reimplemented as one implementation **and no behavior change** — this is a refactor, and ntfy users must see no difference. Guard it with tests that pin current ntfy output.
- `telegram` as a second implementation, dispatching to **all** enabled providers. ntfy and Telegram running together is the expected end state, not an either/or.
- Per-project and per-chat configuration, which does not exist today. The nearest precedents for per-entity config are `boardColumns` and `tunnel.apps` (`SUPPORTED_TOML_KEYS`, `src/core/config.ts:1746`); Hub capabilities show the DB-row pattern for per-owner config with TTL and revocation. Notification routing belongs in a table keyed by chat, not in a new flat scalar.
- The story's event set: task created, task started, agent needs input, agent completed, moved to review, review feedback available, integration/merge failure, server or agent failure. Each carries repository name, task id and title, current status, a short summary, and a link into the web UI, with optional inline action buttons.

## Do not copy these ntfy traits

- `shouldSend` **logs on every call** (`src/server/ntfy.ts:93,98,101`) and is called inside `publish`, so every notification logs several times. Do not reproduce this in the new layer.
- ntfy's `NotificationPriority = "min" | "low" | "default" | "high" | "max"` is ntfy's vocabulary, not a portable one. Keep it inside the ntfy adapter; use a RepoOS-level severity in the shared interface and map on the way out.

## Done when

- ntfy output and delivery are unchanged by the refactor, pinned by test.
- Both providers dispatch from one call site; a Telegram failure is proven not to affect a status transition.
- Notifications route per chat, and only to bound chats.

## Activity

- 2026-09-27T07:33:00Z · created · unknown
- 2026-09-27T07:34:17Z · status inbox→ready
- 2026-09-27T15:42:33Z · body
- 2026-09-27T15:51:53Z · body
- 2026-09-27T15:52:44Z · body
- 2026-09-28T01:11:51Z · status ready→active, branch
- 2026-09-28T01:18:16Z · status active→review
