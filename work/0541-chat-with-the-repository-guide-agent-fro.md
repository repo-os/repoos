---
updated_at: "2026-09-28T14:10:39Z"
review_passes: 3
id: "0541"
title: Chat with the repository guide agent from Telegram
type: feature
status: review
priority: p2
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: feat/chat-with-the-repository-guide-agent-fro
model_override: opencode-go/glm-5.3-flash
review_model_override: opencode-go/mimo-v2.6-flash
created_at: "2026-09-27T07:33:38Z"
review_rounds: 2
---
## Problem

Story #0003 acceptance criterion: "Telegram users can chat with the repository guide agent." The story is explicit that these messages "map to existing RepoOS chat and agent APIs rather than introducing a separate agent runtime" — so this is a new front end onto `AgentRunner`, not a new agent.

This is the first feature where a Telegram message becomes an **LLM call with a real cost**, which brings two repo rules into play.

## The usage-recording rule

`AGENTS.md`: every LLM call site must record its usage in the `sessions` table. The `AgentRunner` path self-records, but **any one-shot call using `runPrompt` must call `recordOneShotSession(repoRoot, agent, result, { sessionType, taskId })` from `src/server/agents.ts` immediately after the await.** Several callers discarded their `PromptResult` before this rule existed, which silently under-reported the Tokens tab. Telegram-originated turns are AI spend like any other and must appear — otherwise a whole channel of agent usage vanishes from the board summary.

If a repository guide conversation is task-scoped, pass the `taskId`; if it is repository-level, `taskId: null`, which is the established shape for work not tied to a task. Pick a `sessionType` that keeps the by-role breakdown legible, and do not pass `pm`.

## Conversation state

A private chat is a natural 1:1 conversation. A group is not — several authorized users can talk to the bot in the same chat, and one shared transcript would interleave unrelated conversations and leak one user's context to another. Decide the model explicitly:

- Keep conversation state **per Telegram user**, not per chat, so two members of a group do not share context.
- If state is per chat, a group conversation must be visibly labeled as shared, and history should not cross user boundaries.

Per-user state is the safer default and is consistent with the whole auth design: identity is per user, and so is context.

Also decide how a conversation is **closed or expired** so context does not accumulate indefinitely, and what a user sees when a stale conversation is resumed.

## Cost and rate controls

Agent turns are the most expensive thing Telegram can trigger, and a group makes it trivially easy to burn a budget — several members, each firing off turns, all metered against the repository. This is why the authorization task's per-user **and** per-chat rate limits matter most here: enforce the tighter agent-specific limit before starting a run, and return a clear message when it applies rather than silently dropping.

## Done when

- A linked user can hold a conversation with the repository guide agent from both a private chat and a group.
- Two users in one group do not see each other's conversation state.
- Every turn appears in the Tokens tab with correct `taskId` and `sessionType`, asserted by test.
- The rate limit is enforced before any LLM call is made.

## Activity

- 2026-09-27T07:33:38Z · created · unknown
- 2026-09-27T15:42:39Z · body
- 2026-09-27T15:51:56Z · body
- 2026-09-27T15:52:48Z · body
- 2026-09-28T01:18:42Z · status inbox→ready
- 2026-09-28T11:43:27Z · model_override
- 2026-09-28T11:43:32Z · review_model_override
- 2026-09-28T11:43:33Z · status ready→active, branch
- 2026-09-28T12:52:09Z · status active→review
- 2026-09-28T13:18:19Z · status review→active
- 2026-09-28T13:45:15Z · status active→review
- 2026-09-28T13:53:36Z · status review→active
- 2026-09-28T14:02:44Z · status active→review

