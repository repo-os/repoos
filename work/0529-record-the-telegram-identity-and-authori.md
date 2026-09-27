---
updated_at: "2026-09-27T15:40:59Z"
review_passes: 1
id: "0529"
title: Record the Telegram identity and authorization model
type: feature
status: review
needs_input: true
needs_input_reason: check-failed-after-retries
priority: p1
area: docs
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: feat/record-the-telegram-identity-and-authori
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-09-27T07:31:53Z"
last_check_failure: "[object Object]"
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
- 2026-09-27T15:13:46Z · model_override
- 2026-09-27T15:13:51Z · status ready→active, branch
- 2026-09-27T15:23:52Z · handoff failed · check failed after 2 automatic retries · remote validation failed (exit 137) — + pinia@4.0.2
+ radix-vue@1.9.17
+ shiki@4.4.3
+ tailwind-merge@3.6.0
+ tailwindcss@4.3.3
+ typescript@5.9.3
+ vite@8.2.0
+ vitest@4.1.10
+ vue@3.5.40
+ vue-router@5.2.0
+ vue-tsc@3.3.9
422 packages installed [6.04s]
$ bun scripts/build.mjs
$ tsc -p tsconfig.json && bun run build:ui && bun scripts/copy-assets.mjs
$ vue-tsc --noEmit -p src/ui-app/tsconfig.json && vite build --config src/ui-app/vite.config.ts
/usr/bin/bash: line 1:    40 Killed                  vue-tsc --noEmit -p src/ui-app/tsconfig.json
error: script "build:ui" exited with code 137
error: script "build:raw" exited with code 137
error: script "build" exited with code 137
[validate] gate exit 137 — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally
- 2026-09-27T15:29:05Z · watchdog: escalated to needs_input · check-failed-after-retries · check failed after 2 automatic retries · remote validation failed (exit 137) — + pinia@4.0.2 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-09-27T15:36:04Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-27T15:39:20Z · status active→review

