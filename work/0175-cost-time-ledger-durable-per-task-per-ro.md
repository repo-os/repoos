---
id: "0175"
title: "Cost & time ledger: durable per-task/per-round usage tracking with a queryable store + UI"
type: feature
status: ready
priority: p2
area: server + ui-app
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-13T15:21:15Z"
updated_at: "2026-08-13T15:26:36Z"
---
> **SUPERSEDED BY #0176** — this scope (durable per-task/per-round cost/time ledger) is absorbed by the universal sqlite session-stats task. See #0176; the per-task/round views described here become views over that store. Do not start this in parallel.

## Problem
Agent and reviewer turns already extract tokens/cost/time, but only ephemerally — accumulated in memory per session and shown live in the task panel, never persisted durably or aggregated. #0118 has now gone through 4+ review rounds; nobody can see how much that cost in time and money until it is over, and there is no way to compare rounds, agents, or tasks. That invisibility is why over-rounds and runaway spend go unnoticed.

## Goal
A durable, queryable ledger of every agent turn (engineer, reviewer, guide) recording cost and time, aggregated per task (across turns, resumes, and review rounds) and surfaced in the UI.

## Acceptance criteria
1. **Ledger events**: every agent turn records an event with { taskId, sessionId, turnId, agent, model, phase (implement | review | guide | review-round-N), startedAt, endedAt, elapsedMs, inputTokens, outputTokens, totalTokens, costUsd, source (extractUsage | estimate | fallback) }. Append-only, durably persisted, survives server restarts and resume turns (totals must re-accumulate deterministically from persisted events, not drift).
2. **Store**: queryable and durable. Prefer `bun:sqlite` (built into Bun; also available as `node:sqlite` on Node >= 22, so zero runtime dependencies is preserved). If the implementer prefers flat files, a documented append-only JSONL ledger under `.repoos/usage/` with an aggregation pass is acceptable — but a task, agent, round, and day must be cheap to sum.
3. **Reuse existing extraction**: hook into `extractUsage()` and the existing per-session accumulators in `src/server/agents.ts` (lines ~126, ~134, ~173) rather than duplicating parsing. Elapsed time per turn must come from the same source that already tracks turn timing.
4. **Review rounds are first-class**: each reviewer run records its own event with the review round number. The task drawer must show review-round cost/time, e.g. "review round 3/2 — $0.31 · 1m12s".
5. **Aggregates**: per task (all turns, resumes, review rounds), per agent, per day. A board-level summary in the UI (total spend, total tokens, total time, most expensive task).
6. **UI**: cost/time shown in the task drawer (extending what the panel already shows live) and a board-level cost panel. Nothing expensive — reuse existing drawer/streaming components.
7. **Budget hooks**: a per-task and per-board soft spend cap that is queryable, so #0173 (review-round cap) and #0174 (CTO agent) can consult it. The cap itself need not be enforced yet.
8. `repoos check` green.

## Notes
- Motivator: #0118 is on review round 4 (now 5) — the cost of these rounds is currently invisible. This ledger is what makes the #0173 two-round cap and #0174 CTOS's policing actionable with real numbers.
- Zero runtime dependencies is a hard constraint; `bun:sqlite` / `node:sqlite` are platform builtins, not npm deps.
- Keep extraction best-effort: when `extractUsage` returns nothing (opaque model output), record the turn with `source: fallback` and estimate from tokens if available; never fail a turn because usage extraction failed.
- Coordinate with #0173 and #0174 so round counters and budgets share the ledger as the source of truth.

## Activity

- 2026-08-13T15:21:15Z · created · unknown
- 2026-08-13T15:26:36Z · body
