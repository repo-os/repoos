---
id: "0141"
title: "Pull opencode token usage and cost from `opencode export` instead of showing \"—\""
type: feature
status: review
needs_merge: true
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: feat/pull-opencode-token-usage-and-cost-from-
created_at: "2026-08-12T19:40:00Z"
updated_at: "2026-08-12T14:22:50Z"
---
## Problem

The Agent tab on each task shows a "time — tokens — cost" section, but tokens and cost always display `"—"` when using opencode as the coding agent. The current `extractUsage()` function (`src/server/agents.ts:172`) passively regex-matches raw CLI output lines for usage data, but opencode's `--format json` output doesn't include a usage/result event — the data exists in opencode's own session store but never reaches RepoOS.

## Desired UX

Every opencode agent session should report authoritative token counts and cost in the task's Agent tab, matching what opencode's own web console and `opencode stats` CLI command show.

## How

`opencode export <sessionID> --sanitize` returns per-message/turn JSON with `tokens` (total, input, output, reasoning, cache) and `cost` (USD) fields. The `AgentRunner` already captures the session ID from opencode's output (`session.sessionId`). At turn completion (or a suitable trigger), run the export command, parse the JSON, and feed the totals into `session.tokens` / `session.costUsd` so they flow through the existing SSE `agent.stats` → store → UI pipeline.

## Acceptance criteria

- [ ] `AgentRunner` calls `opencode export <sessionId> --sanitize` at an appropriate point (e.g. when a turn completes or on stats snapshot) for opencode sessions that have a session ID
- [ ] Parsed `tokens.total` and `cost` from the export JSON populate `session.tokens` and `session.costUsd`
- [ ] The existing SSE `agent.stats` event and UI display show the real values instead of `"—"`
- [ ] Fail gracefully if the CLI is unavailable, the session ID is missing, or the export fails — fall back to current behavior (`null` → `"—"`)
- [ ] No regression for other agents (claude, codex, copilot, qwen, plain) — their existing `extractUsage` path is unchanged
- [ ] `repoos check` passes

## Notes for AI

- Primary touch points: `src/server/agents.ts` (`AgentRunner`, `snapshotStats`, `emitStats`, turn lifecycle)
- The session ID is extracted by `tryExtractSessionId` and stored in `session.sessionId`
- `runGit` / `runProcess` patterns in the codebase show how to spawn the CLI; use a short timeout (10s) since export is local
- The export JSON contains an array of `conversations[]` → `messages[]` → `parts[]`; each `step-finish` part carries `tokens` and `cost`. Sum across all parts for the session total
- `opencode export` with no session ID is interactive — always pass the session ID
- Test with a fixture that mocks `opencode export` output
- Also consider: can this be called on `GET /api/tasks/:id/output` (lazy, on demand) instead of during the turn, to avoid blocking the agent stream?

## Activity

- 2026-08-12T22:10:00Z · status ready→review, branch
- 2026-08-12T14:22:50Z · needs_merge
