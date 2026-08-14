---
review_rounds: 2
id: "0176"
title: "Add bun:sqlite and track ALL AI session stats (engineer, reviewer, PM, Ross, CTO, tech-debt, ...)"
type: feature
status: done
priority: p1
area: core + server + ui-app
assigned_to: ai
created_by: ""
branch: feat/add-bun-sqlite-and-track-all-ai-session-
created_at: "2026-08-13T15:26:25Z"
updated_at: "2026-08-14T08:52:00Z"
---
## Problem
Every AI conversation in RepoOS currently keeps its stats (time, tokens, cost) only in memory — per session, live in a panel, never durably stored, never aggregated. And task sessions are the only ones with any usage extraction at all. Ross chat, the PM/tech-debt agents, reviewer runs, and (soon) the CTO chat have no tracking at all. #0118's 4+ review rounds cost real money with zero visibility.

This task puts a real store in the project — `bun:sqlite` — and makes session stats universal: every AI session, of every type, records time, tokens, cost, coding agent, and model. The sqlite layer is also project infrastructure to be reused by future features (budgets, audit, #0173/#0174 hooks, whatever comes next).

## Goal
1. A durable, queryable sqlite store (bun:sqlite — built into Bun, zero runtime deps).
2. Universal session-stats instrumentation in the agent layer so EVERY AI session — task engineer, reviewer, PM, Ross (guide) chat, CTO chat, tech-debt, and any future agent — is recorded automatically, with no per-agent special-casing.
3. Aggregations (per task, per session type, per agent/model, per day) and UI surfacing.

## Acceptance criteria
1. **Sqlite infrastructure** (`src/core/db.ts` or similar): open/create the database at `.repoos/repoos.db`, WAL mode, a schema/migration registry (simple versioned migrations), idempotent startup. Zero runtime deps — `bun:sqlite` is a platform builtin (Node >= 22 has `node:sqlite`; the built CLI already targets Node >= 20, so add a clear availability guard and fail-soft: stats degrade to no-op if the store can't open, never crash the server).
2. **Universal session table(s)**: every session records { sessionId, sessionType, taskId (nullable), agent, model, codingAgent (claude/codex/opencode/...), startedAt, endedAt, elapsedMs, inputTokens, outputTokens, totalTokens, costUsd, costSource (extractUsage | estimate | none), status (active/finished/errored), lastActivityAt }. One session may span multiple resume turns — turns accumulate into the same record deterministically (persisted, not re-derived from transcripts).
3. **Instrumentation in the agent layer, not per feature**: hook into the shared runner/session plumbing so these all record automatically with zero per-agent code:
   - task engineer sessions (AgentRunner),
   - reviewer runs (each review round is its own record, tagged with round number),
   - Ross / RepoGuide chat (REPO_GUIDE_SESSION_ID),
   - PM agent chat (and the task chat from #0171),
   - CTO chat (from #0174),
   - tech-debt (or any other configured agent),
   - and any future agent type — new session types must be picked up without code changes.
4. **Fields**: time (per-turn and cumulative elapsedMs), tokens (input/output/total), cost (reuse `extractUsage` in `src/server/agents.ts:173`; fall back to an estimate tagged `costSource: estimate` when extraction yields nothing; never fail a session because usage extraction failed), coding agent (the engine binary used), model (the model name).
5. **Aggregations**: cheap queries for per-task totals (all turns + review rounds), per session type, per agent/model, per day; and a board-level summary (total spend, tokens, time, most expensive session/task). Review rounds are first-class (see "review round N — $X · YmZs").
6. **UI**: extend the task drawer to show cumulative session stats (replacing/absorbing the live-only panel), and a board-level stats view. Reuse existing drawer/streaming components; nothing expensive.
7. **Budget/round hooks**: queryable per-task and per-board spend/token counters that #0173 (review-round cap) and #0174 (CTO) can read. Enforcing is out of scope here.
8. **Reuse story**: the db module is generic (schema registry) so future features can add tables/migrations — note in the PR/commit what the next consumer would be.
9. `repoos check` green, including a UI smoke test.

## Notes
- Supersedes/absorbs #0175 (task-centric cost/time ledger): the ledger and per-task/round views in #0175 are just views over this store. Cross-reference #0175 so nobody starts it in parallel.
- Zero runtime dependencies is a hard constraint. `bun:sqlite` is not an npm dependency. If the sqlite module must also run under plain Node, gate on `node:sqlite` availability and fail soft.
- Persistence of usage extraction: prefer writing events at turn end (endedAt, totals) with an update path for long-running turns; keep writes small and batched/debounced where sensible.
- Motivator: #0118 on review round 5, costs invisible. This task is what makes cost visible, and what the #0173 cap and #0174 CTO will read.
- Keep the migration story honest: schema v1 now, but design the registry so adding a column/table later is a documented, versioned migration.

## Activity

- 2026-08-13T15:26:25Z · created · unknown
- 2026-08-14T00:08:28Z · status ready→active, branch
- 2026-08-14T08:42:00Z · status active→review
- 2026-08-14T08:52:00Z · status review→done

