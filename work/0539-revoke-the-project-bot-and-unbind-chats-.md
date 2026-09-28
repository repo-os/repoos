---
id: "0539"
title: Revoke the project bot and unbind chats on disconnect
type: feature
status: review
needs_merge: true
priority: p2
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: feat/revoke-the-project-bot-and-unbind-chats-
created_at: "2026-09-27T07:33:20Z"
updated_at: "2026-09-28T06:48:05Z"
---
## Problem

Story #0003 acceptance criterion: "Disconnecting Telegram revokes the project bot token and removes all chat bindings." Its security requirements add: "Revoke the project bot token when Telegram integration is disconnected."

Disconnect is the operation with the highest blast radius and the least forgiveness. Every failure mode here is the same failure — **a half-completed disconnect that still delivers.** Revoke fails, but the token is deleted locally, so the admin believes they are disconnected while the bot is still alive in their group. Or the token is deleted but the chat bindings survive, so a reconnected bot resumes delivering into chats nobody re-approved. A "disconnected" UI that still leaks is worse than no UI at all, because it is a false assurance.

## What to build

One operation, in a deliberate order, that is **complete or loudly incomplete**:

1. Revoke the bot at Telegram (managed-bot revocation, or delete + revoke for a bring-your-own token) and confirm the result.
2. Only on confirmed revocation: delete the stored encrypted token.
3. Delete every chat binding and every user link for this repository.
4. Remove the bot's webhook at Telegram, so a still-public endpoint stops being meaningful.
5. Write an audit event — `actorEmail` is the admin who disconnected, and the details record whether revocation was confirmed or merely attempted.

- **Make it idempotent and re-runnable.** An admin who clicks disconnect twice, or retries after a network error, must converge to the same state.
- **Surface partial failure honestly.** If step 1 fails, say so and keep local state intact, rather than reporting success. A failed disconnect must leave the admin able to retry, and must be visibly distinguishable from a successful one.
- **Confirm before destroying.** Disconnect is destructive and irreversible for a bring-your-own token — the user will need a new one from BotFather. Confirmation is warranted even though the story treats it as a single click.
- Revoking must also be reachable by an admin **managing users**, not only from the Telegram panel, or an org that has to cut access quickly has no path to it.

## What this must not do

- Do not touch other repositories. Each project has its own bot and its own bindings, and cross-repository damage here would breach the isolation the story is built on. Scope every delete by repository or instance identity and test it.
- Do not delete rows belonging to a different instance that happens to share a chat. A group containing two project bots is a case the story's isolation requirement covers directly.

## Done when

- Disconnect revokes, removes the token, unbinds chats and links, and removes the webhook, with a test per step.
- A simulated Telegram outage produces a visible, retryable failure and no false success.
- Two repositories with Telegram both connected can disconnect one with no effect on the other, proven by test.

## Activity

- 2026-09-27T07:33:20Z · created · unknown
- 2026-09-27T15:42:37Z · body
- 2026-09-27T15:51:54Z · body
- 2026-09-27T15:52:46Z · body
- 2026-09-27T23:54:32Z · status inbox→ready
- 2026-09-28T01:11:58Z · status ready→active, branch
- 2026-09-28T01:23:41Z · status active→review
- 2026-09-28T06:40:52Z · needs_merge
