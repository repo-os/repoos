---
status: accepted
date: 2026-09-27
deciders: repoos maintainers
---

# 0007 — Telegram identity is bound to the RepoOS allowlist

## Context

Telegram identifies an account with a numeric user ID and optional mutable
username. It has no RepoOS email or role. A group chat identifies a place to
send and receive messages, but membership in that chat is not evidence that
each participant may access the repository. Without an explicit identity
binding, the Telegram integration would either have no usable authorization
model or accidentally create a second permission system.

The Telegram story also put permission checks and audit logging in Phase 2,
after Phase 1 notifications. That order cannot be implemented securely: the
first notification already discloses repository information and must have a
known, authorized destination. Identity, authorization, and audit behavior
therefore belong in Phase 1, before notifications or commands are shipped.

## Decision

Maintain two independent bindings:

- **User binding (authorization):** `telegram_user_id` maps to an email already
  present in this repository's `auth_users` allowlist. The numeric Telegram ID
  is the identity key; a Telegram username may be retained for display only
  and is never an authorization input. Linking requires the account-binding
  flow described in [#0533](../../work/0533-bind-telegram-users-to-allowlisted-repoo.md).
- **Chat binding (routing):** `telegram_chat_id` maps to this repository as an
  approved place for the bot to communicate. Only an authenticated RepoOS
  admin can authorize that binding. The bot merely being present in a chat is
  not consent. See [#0535](../../work/0535-link-telegram-chats-to-a-repository-from.md).

The bindings do not imply one another. A bound group does not authorize its
members. For every incoming message, resolve its sender's Telegram ID to the
linked email, then look up that email's current role in `auth_users` and
authorize against that live result. Never cache a role on the Telegram link
row. A role change takes effect on the next message; deleting the allowlist
row makes the Telegram link inert immediately, without a revocation sweep.
This keeps `auth_users` the single source of truth and Telegram a second
transport onto existing identities, not a parallel permission system. The
enforcement task is [#0534](../../work/0534-authorize-every-telegram-message-against.md).

Unbound or unauthorized senders produce a silent no-op. In a group, an
"access denied" response would reveal that the bot and integration are active
and would clutter the channel; silence avoids both disclosures and spam.

No `auth_audit_log` schema change is needed. Telegram actions have a bound,
allowlisted email for `actorEmail`, which is already email-typed. System-
initiated actions use `actorEmail: null` and record context in details.

## Consequences

- Phase 1 includes identity linking, per-message live authorization, and audit
  logging before notification delivery. Phase 2 may add further commands, but
  it does not introduce the authorization foundation.
- Telegram usernames, chat administrators, and group membership never grant
  RepoOS roles or access.
- Implementations must preserve sender identity through command handling and
  audit records. Unknown senders do not receive an authorization error.
- User-facing connection and linking guidance is in
  [Telegram](../../user-docs/telegram.md); RepoOS login and allowlist behavior
  is described in [native authentication](../../user-docs/native-auth.md).

## Related implementation tasks

- [#0533 — Bind Telegram users to allowlisted RepoOS identities](../../work/0533-bind-telegram-users-to-allowlisted-repoo.md)
- [#0534 — Authorize every Telegram message against a live role and audit it](../../work/0534-authorize-every-telegram-message-against.md)
- [#0535 — Link Telegram chats to a repository from an authenticated admin](../../work/0535-link-telegram-chats-to-a-repository-from.md)
