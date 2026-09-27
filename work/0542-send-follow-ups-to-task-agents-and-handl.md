---
id: "0542"
title: Send follow-ups to task agents and handle needs-input over Telegram
type: feature
status: inbox
priority: p2
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-27T07:33:47Z"
updated_at: "2026-09-27T15:52:49Z"
---
## Problem

Story #0003 acceptance criterion: "Telegram users can continue an existing task-agent conversation," plus notifications for agent completion, review, review feedback, and integration/merge failure.

Continuing a *specific task's* agent conversation is the sharpest test of the auth model, because it is the first place a Telegram user acts on a named task rather than reading repository state. A user must not be able to reach an agent conversation for a task they should not see, and a task agent must not become reachable by guessing an id.

## What to build

- Route a follow-up to the running agent for a specific task, through the existing agent APIs. Confirm the task exists, is active, and has a running agent before addressing the message to one — silently dropping a message into a task with no live agent is confusing and looks like data loss.
- **Agent needs input** becomes a conversation, not just a notification: when an agent is blocked on a question, an authorized user answers and the answer reaches the agent. The story lists this as a Phase 3 interaction and it is the most valuable one in practice — it is what makes an unattended task resumable from a phone.
- Notifications for: agent completed, task moved to review, review feedback available, integration or merge failure, server or agent failure. Failures matter more than successes here: an integration or merge failure that only shows up on a board someone is not looking at is a silent stall.

## Authorization is task-scoped, and it is admin-scoped

- **Answering "agent needs input" is a privileged action** — it supplies input to an agent that is changing a repository. Gate it on the sender's **live** role, and require `admin` for anything that lets a user steer a task toward a status transition. A `member` may read status and be notified; a `member` should not be able to drive an agent to completion.
- Apply the same live-role resolution as everywhere else, so a demoted user's queued follow-ups stop being accepted.
- Confirm that the task belongs to **this** repository before routing. Cross-repository access is the story's headline isolation requirement, and a task id from another project must be indistinguishable from one that does not exist — not an error that confirms it exists.

## Attribution — the `?? "human"` trap, live this time

Task transitions driven from Telegram must record the real actor. Existing callers use `getCurrentUser(req, config)?.email ?? "human"` (`src/server/routes/tasks.ts:658`, `:1462`), which is exactly the path that erases attribution. Route Telegram-driven transitions through an explicit identity path so the activity entry and audit log name the Telegram user's allowlisted email.

## Done when

- An authorized user can answer a needs-input prompt and the agent receives the answer.
- A `member` cannot drive an agent toward a status transition; a demoted `admin` immediately loses the ability.
- A task id from another repository is indistinguishable from a nonexistent one.
- Every Telegram-driven transition records the bound email as actor, never `"human"`, and the turn is recorded for token usage.

## Activity

- 2026-09-27T07:33:47Z · created · unknown
- 2026-09-27T15:42:40Z · body
- 2026-09-27T15:51:57Z · body
- 2026-09-27T15:52:49Z · body
