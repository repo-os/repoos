---
id: "0533"
title: Bind Telegram users to allowlisted RepoOS identities
type: feature
status: done
priority: p1
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: feat/bind-telegram-users-to-allowlisted-repoo
model_override: cursor-grok-4.6-medium
created_at: "2026-09-27T07:32:28Z"
updated_at: "2026-09-27T23:02:42Z"
---
## Problem

This is the core of the auth model, and the piece story #0003 never specifies. **Telegram has no email address.** A Telegram account is a numeric `user_id` with a changeable, spoofable `@username` — it carries no verifiable relationship to an `auth_users` row. Something has to bridge that gap, and if the bridge is wrong, the allowlist is bypassed entirely.

See [ADR 0007 — Telegram identity and authorization](../docs/adr/0007-telegram-identity-and-authorization.md), accepted in [task #0529](0529-record-the-telegram-identity-and-authori.md), for the shared binding and authorization decision. This task implements its specific flow.

RepoOS's identity model is unforgiving in a useful way here: `auth_users` has `email TEXT PRIMARY KEY` and `role TEXT NOT NULL DEFAULT 'member'` (`src/core/auth-store.ts:121`). The email *is* the identity, and that table *is* the allowlist — `getUser(email) === null` means "not allowed in". There is no separate whitelist, no `user_id`, and no third role (`AuthRole = "admin" | "member"`, `src/core/auth.ts:17`).

## What to build

A link table plus a binding flow that only an authenticated admin can start:

```sql
CREATE TABLE telegram_user_links (
telegram_user_id INTEGER PRIMARY KEY,   -- numeric, never a username
email           TEXT NOT NULL,          -- FK → auth_users.email
telegram_username TEXT,                 -- display/lookup hint only
bound_at        TEXT NOT NULL,
bound_by        TEXT,                   -- admin email that authorized it
last_seen_at    TEXT,
revoked_at      TEXT
);
```

- The admin, authenticated in web Settings, creates a **short-lived, single-use, signed invite** naming the RepoOS email it is for. This reuses the story's own linking-request pattern (repository identity, instance identity, expiry, random nonce) — the same shape already specified for bot provisioning, so the mechanism is consistent rather than invented twice.
- The invite travels as a Telegram deep link: `https://t.me/<projectBot>?start=<signed nonce>`. The user opens it, the bot receives `/start <nonce>`, and the bot binds `telegram_user_id` → that email.
- **Refuse to bind to an email not present in `auth_users`.** The invite must not be a way to mint access for an address that was never allowlisted. A user removed from the allowlist cannot redeem an invite while absent. If the same email is later re-added, the existing link becomes active automatically and uses that row’s current role; no relinking or stale-role cleanup is needed.
- **Refuse to silently rebind** a `telegram_user_id` already bound to a different email. Reassignment is an explicit admin action with an audit entry, never a side effect of redeeming a second invite.
- `telegram_username` is stored only to make the link recognizable in the Settings UI. It is never an authorization input — a renamed `@handle` must not change or preserve anyone's access.
- Expiry, single use, and nonce replay are all enforced, and a redeemed or expired invite cannot be reused.

This is deliberately **the same answer for both of the user's use cases**: an individual in a private chat and a member of a project group are bound by exactly this one mechanism. "Group" versus "private" is a question about chats, not about users.

## Done when

- A bound user's messages resolve to the allowlisted email and its role, and that resolution is used for authorization.
- Non-allowlisted emails, expired invites, replayed nonces, and duplicate rebinds are all rejected, each with a test.
- No authorization decision anywhere reads a Telegram username.
- Binding and unbinding write audit events.

## Activity

- 2026-09-27T07:32:28Z · created · unknown
- 2026-09-27T07:34:13Z · status inbox→ready
- 2026-09-27T15:15:28Z · body
- 2026-09-27T15:42:30Z · body
- 2026-09-27T15:51:50Z · body
- 2026-09-27T15:52:41Z · body
- 2026-09-27T15:59:54Z · body
- 2026-09-27T19:00:57Z · model_override
- 2026-09-27T19:01:00Z · status ready→active, branch
- 2026-09-27T19:15:22Z · status active→review
- 2026-09-27T23:02:42Z · status review→done, release:success
