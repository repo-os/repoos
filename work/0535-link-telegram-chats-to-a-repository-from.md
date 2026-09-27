---
id: "0535"
title: Link Telegram chats to a repository from an authenticated admin
type: feature
status: ready
priority: p1
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-27T07:32:50Z"
updated_at: "2026-09-27T15:52:43Z"
---
## Problem

Story #0003 steps 10-12 say: "RepoOS displays an *Add this bot to your project group* action. The administrator adds the bot to a group or starts a private chat with it. RepoOS verifies the chat and completes the link."

**"Verifies the chat" is doing too much work, and as written it is a vulnerability.** Nothing in that flow proves the person who added the bot was an authorized admin. Anyone can add a bot to a Telegram group or open a private chat with it. If chat binding triggers on mere bot presence, an attacker adds the project bot to a chat they control, the integration binds it, and the repository's task notifications — titles, ids, statuses, links — start arriving in a channel the project never approved. That is an unauthenticated information disclosure, and it is exactly the failure mode the story's own security requirements ("verify that every incoming chat is linked to the expected repository") are meant to prevent.

## The rule: a chat binding is an admin action, never an observation

- **Chat binding is not authorization.** It records *where* the bot may talk. Who may talk there is decided per message, per sender, by the live-role lookup — a bound group confers nothing on its members. This is the separation that makes "all users in the group are the RepoOS allowlist" work without that assumption being enforced by anything.
- Binding a chat requires an **authenticated RepoOS admin** action: either from web Settings, or by an admin generating a short-lived chat-binding code and posting it in the group. Bot presence alone is never sufficient, and neither is a `/start` from an unlinked chat.
- A private chat is the same mechanism with one participant: an admin authorizes the specific `chat_id`, or an allowlisted user completes their own binding and their 1:1 chat is bound as a consequence.
- The same user may have a private chat **and** be in a bound group. These are independent, not alternatives — which is the direct answer to "either group or individual, or both": both, simultaneously, with no extra configuration.

## Group trigger rules

In a group, act only when the message is addressed to the bot. Story #0003 requires one of: a command addressed to the bot, a reply to a bot message, or a direct `@mention`. Implement all three, and do not widen this later without an explicit decision.

**Privacy mode stays enabled.** Telegram recommends it by default, and it is what keeps the bot from reading ordinary group chatter. Do not disable it to simplify message intake — an intake path that needs every group message is a design smell worth fixing at the design layer.

## Group membership is not a role

- Telegram has no notion of a RepoOS role. A user's role comes from `auth_users` and nothing else; a group admin, a chat creator, and a chat "owner" have no extra RepoOS authority.
- Removal from a group does not revoke RepoOS access, and presence in a group does not grant it. Both directions are non-events by design.
- If a group is bound and an unbound member speaks, the silent-no-op rule from the authorization task applies — no reply, nothing logged beyond a rate-limit counter.

## Done when

- A chat cannot be bound without an authenticated-admin action, and a test proves an attacker-added bot never receives notifications.
- A bound group with mixed allowlisted and non-allowlisted members authorizes only the allowlisted senders, verified by test.
- One user bound in both a private chat and a group is authorized in both.
- Privacy mode is asserted in the bot configuration tests.

## Activity

- 2026-09-27T07:32:50Z · created · unknown
- 2026-09-27T07:34:16Z · status inbox→ready
- 2026-09-27T15:15:30Z · body
- 2026-09-27T15:42:32Z · body
- 2026-09-27T15:51:52Z · body
- 2026-09-27T15:52:43Z · body
