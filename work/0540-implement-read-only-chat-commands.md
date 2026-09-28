---
id: "0540"
title: Implement read-only chat commands
type: feature
status: active
priority: p2
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: feat/implement-read-only-chat-commands
created_at: "2026-09-27T07:33:29Z"
updated_at: "2026-09-28T10:30:17Z"
---
## Problem

Story #0003 Phase 2: "Implement `/status`, `/tasks`, `/agents`, and `/help`." These are the first commands a linked user can run, and the first place the auth model becomes user-visible — so they are also the first place it can be wrong.

Everything here sits behind the authorization task: a sender's live role is resolved before any command runs, and an unbound or unauthorized sender is a silent no-op.

## What to build

- `/status` — repository-level state: active tasks, anything needing attention, agent and review state.
- `/tasks` — list active tasks, scoped to what the sender's role permits.
- `/agents` — running and recently finished agents.
- `/help` — available commands **and what the sender's own role can and cannot do.** A `member` asking for admin actions should be told the boundary exists, not left to discover it by being refused later. Make `/help` role-aware rather than a static string.

Map these onto the **existing** RepoOS read APIs and the live index — the story is explicit that Telegram should not introduce a separate agent runtime or a parallel data path. If a command needs data the existing routes do not expose, widen the existing route rather than building a Telegram-only query.

## Message formatting

Telegram's message limit is 4096 characters, and long task lists will exceed it. Paginate or truncate with an explicit "showing N of M" and a way to get the rest — silently cutting a list mid-item reads as data loss. Render the same `NotificationSpec`-style shared content the notification provider uses where it overlaps, rather than a second formatting path for the same facts.

Link through to the web UI for detail, so Telegram stays a notification and glance surface rather than a full client.

## Group behavior

In a bound group these commands work for any authorized sender, but keep the trigger rules: a command addressed to the bot, a reply to a bot message, or an `@mention`. A bare `/status` typed into a large group where the bot is a member should not produce output from every authorized member at once. Handle a burst of concurrent commands from several group members without interleaving output.

## Done when

- All four commands work in a private chat and in a bound group, behind the live-role check.
- `/help` output differs for `admin` and `member`.
- An unbound sender, and a bound sender whose `auth_users` row was deleted mid-session, both get nothing.
- Oversized output paginates rather than truncating silently.

## Activity

- 2026-09-27T07:33:29Z · created · unknown
- 2026-09-27T15:42:38Z · body
- 2026-09-27T15:51:55Z · body
- 2026-09-27T15:52:47Z · body
- 2026-09-27T23:54:38Z · status inbox→ready
- 2026-09-28T10:30:17Z · status ready→active, branch
