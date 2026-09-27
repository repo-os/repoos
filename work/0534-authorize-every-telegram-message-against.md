---
id: "0534"
title: Authorize every Telegram message against a live role and audit it
type: feature
status: ready
priority: p1
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-27T07:32:39Z"
updated_at: "2026-09-27T15:52:42Z"
---
## Problem

Story #0003 lists "permission checks and audit logging" under Phase 2 and "rate-limit Telegram commands and agent messages" under security requirements. Both belong in Phase 1: **no message can be authorized before senders can be authorized**, and the very first notification RepoOS sends is already an act of disclosure about a repository. This task is the enforcement point every later Telegram task depends on.

Identity binding alone is not enough. A binding created while someone was an `admin` must stop granting admin powers the moment they are demoted, and must stop granting anything at all the moment they are removed from the allowlist.

## The core rule: resolve the role live, never cache it

On **every** incoming message: `telegram_user_id` → link row → **look up the role in `auth_users` right now** → authorize. Do not store the role on the link row and read it from there.

This is the whole design in one decision, and it pays for itself twice:

- Demote or remove a user in web Settings → the change is effective in Telegram on the next message, with no revocation sweep, no cache invalidation, and no second source of truth to keep in sync.
- A deleted `auth_users` row makes the link **inert automatically**. A revoked web user does not retain a working Telegram session, and there is no window where a stale grant outlives the account.

The cost is one indexed lookup per message, which is free next to an LLM round trip.

## Attribution — do not use the `"human"` fallback

When `config.auth.enabled` is false, `getCurrentUser` returns `null` (`src/server/routes/auth.ts:71-84`) and existing callers paper over it with `?? "human"` — see `src/server/routes/tasks.ts:658` and `:1462`. **A Telegram-driven transition must never land in that fallback.** A status change, review approval, or task creation made from Telegram has a real, known actor, and recording it as `"human"` erases the one fact the audit log exists to preserve. Build an explicit identity path that always carries a non-null actor email, and have it work whether or not the web session auth is enabled.

## Audit

Use `authStore.logAudit(action, targetEmail, actorEmail, details)` (`src/core/auth-store.ts:484`), which is what the auth and Hub paths already do. **`auth_audit_log` needs no schema change**: `actorEmail` is email-typed and every Telegram actor is bound to an allowlisted email. System-initiated actions (provisioning, token rotation, disconnect) pass `actorEmail: null` and a JSON `details` blob, matching the Hub precedent.

Note `action` is a free-text string with no enum or registry — 13 hand-written call sites today. Define the Telegram action names once and reuse them, rather than adding a fourteenth spelling. Audit privileged commands, not just linking.

## Denial behavior

An unbound or unauthorized sender gets a **silent no-op, not an error reply.** In a group, "access denied" confirms the bot exists, confirms the repository has a Telegram integration, and spams the channel on every message from a stranger. In a private chat, one short neutral reply is acceptable; in a group, say nothing.

## Rate limiting

Reuse the exported `RateLimiter` class (`src/server/routes/auth.ts`, already used per-endpoint in `src/server/routes/hub.ts:29`) with limits per Telegram user **and** per chat, applied before authorization does any expensive work. Agent messages are the expensive path and get the tighter limit. The existing limiters are in-memory and per-process — note that as a documented limitation for multi-process deployments rather than implying a distributed guarantee.

## Activity

- 2026-09-27T07:32:39Z · created · unknown
- 2026-09-27T07:34:15Z · status inbox→ready
- 2026-09-27T15:15:29Z · body
- 2026-09-27T15:42:31Z · body
- 2026-09-27T15:43:17Z · body
- 2026-09-27T15:51:51Z · body
- 2026-09-27T15:52:42Z · body
