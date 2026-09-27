---
id: "0529"
title: Record the Telegram identity and authorization model
type: feature
status: ready
priority: p1
area: docs
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: ""
cli_override: codex
created_at: "2026-09-27T07:31:53Z"
updated_at: "2026-09-27T15:13:43Z"
---
## Problem

Story #0003 specifies Telegram integration but never states *how a Telegram user becomes a RepoOS user*. It says "RepoOS should authorize users individually and apply the project's existing admin and member roles" and "A group should not automatically give every member unrestricted RepoOS access" — but the binding mechanism that makes those sentences true is undesigned. Every other phase of the story depends on it, so it has to be decided and written down before any Telegram code exists, not discovered while building chat commands.

This is also a **phase-ordering bug in the story**. It places "permission checks and audit logging" in Phase 2, after Phase 1 has already started sending notifications. That ordering is not implementable: no message can be authorized before senders can be authorized. The model belongs in Phase 1.

## The decision to record

Two **independent** bindings, not one:

- **User binding — the security boundary.** `telegram_user_id` → allowlisted `email` → role. Answers "who is speaking." Never derived from a Telegram username (spoofable and changeable); numeric IDs only.
- **Chat binding — routing, not authorization.** `telegram_chat_id` → this repository. Answers "where may this bot talk." A bound group does **not** confer access on its members; every message is still authorized against the *sender*.

The RepoOS email allowlist (`auth_users`) stays the single source of truth for who may access a repository. Telegram is a second transport onto existing identities, never a parallel permission system. **Role is resolved live from `auth_users` on every message and is never cached on the link row**, so demoting or removing a user in Settings takes effect in Telegram immediately, and a deleted `auth_users` row makes the link inert with no revocation sweep.

Consequences to write down explicitly, because each is a security decision:

- Unbound or unauthorized senders get a **silent no-op**, never an "access denied" reply — in a group an error reply confirms the bot exists and spams the channel.
- A chat can only be bound by an authenticated RepoOS admin. Mere bot presence in a group is not consent (see the task on chat binding).
- `auth_audit_log` needs no schema change: `actorEmail` is email-typed and every Telegram actor is bound to an allowlisted email. System-initiated actions pass `null`.

## Where it goes

- `docs/adr/` — the decision itself, in the ADR form the repo already uses.
- `user-docs/telegram.md` — how an admin connects Telegram and how a user links their account, alongside `user-docs/native-auth.md`.

## Done when

- The ADR states the user-binding vs chat-binding split, the live-role-resolution rule, the silent-no-op policy, and the phase reordering, with the reasoning for each.
- `user-docs/telegram.md` exists and links to `user-docs/native-auth.md` for the underlying identity model.
- This task's answer is referenced by the Telegram implementation tasks rather than re-derived in each of them.

## Activity

- 2026-09-27T07:31:53Z · created · unknown
- 2026-09-27T07:34:09Z · status inbox→ready
- 2026-09-27T15:13:43Z · cli_override
