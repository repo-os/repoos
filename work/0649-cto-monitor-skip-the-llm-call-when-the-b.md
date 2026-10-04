---
id: "0649"
title: "CTO monitor: skip the LLM call when the board is healthy; record why runs fail and what triggered them"
type: feature
status: active
priority: medium
area: core
assigned_to: ai
created_by: ""
branch: feat/cto-monitor-skip-the-llm-call-when-the-b
created_at: "2026-10-04T15:10:22Z"
updated_at: "2026-10-04T15:18:05Z"
---
## Problem

The CTO monitor (`src/server/cto-monitor.ts`) runs a full LLM call on a 5-minute timer plus on every task status change, review completion and agent exit (2s debounce), whether or not anything needs attention. `buildDigest()` never returns null, so a healthy board ("None — all tasks look healthy", build fresh, normal process count) still costs a model call. The only skips are: CTO disabled, a run already in flight, or an identical digest within 60s.

Measured on the live DB (2026-09-27 to 2026-10-04): ~250-420 CTO runs/day, ~87-98K total tokens each (~28-31K uncached input, ~0.5-1.1K output), mostly CLI system prompt + tool definitions. The digest itself is a few hundred tokens. CTO is the top role by token count (176M) but ~2% of spend ($5.56 of $234); the saving is mostly tokens/latency and noise, not dollars.

Separately, 1,457 of 3,601 CTO sessions are `errored` (1,194 of 1,625 on opencode/mimo-v2.5 last week, avg ~3s, i.e. fast failures not timeouts). The failure reason is not recorded anywhere, so the cause is unknown (suspected: no credit on the assigned provider).

## Desired UX

1. Deterministic pre-check: when there are no stuck tasks, no handoff-without-done markers, build marker is fresh and the process check is normal, do NOT call the model. Record nothing or a cheap "healthy, skipped" marker (not an LLM session). Only call the model when something needs attention.
2. Skip when the *material* part of the digest is unchanged since the last run (not just identical-within-60s). Idle-minute counters in `describeStuckSignal` change every minute, so hash the structural signal (task ids + stuck reasons + counts), not the rendered text.
3. Record per CTO run: trigger (timer | event | manual + the event reason), and on failure the error text / exit code (truncated), so credit/auth/provider failures are visible on the Tokens/Agents views.
4. Expose a Settings control for the skip-when-healthy behaviour (see AGENTS.md rule on user-facing settings) with a test.

## Acceptance criteria

- With a healthy board, a monitor tick makes zero LLM calls (test).
- With a stuck task, the model is called exactly once per material change (test).
- Failed CTO sessions store a reason; trigger is stored on every run.
- `repoos check --changed main` passes.

## Notes for AI

- Cache tokens and turns for CTO/reviewer sessions were already fixed in df670234e (`recordRun` in `src/server/cto.ts`). Build on that.
- CTO runs have no durable log (one-shot `runPrompt`, in-memory only), so old runs cannot be backfilled; reviewer rows could and were.
- Every LLM call site must record usage (AGENTS.md); keep `recordRun` as the single place.
- Do not change the CTO prompt contract; just gate when it runs.

## Activity

- 2026-10-04T15:10:22Z · created · unknown
- 2026-10-04T15:12:44Z · status inbox→ready
- 2026-10-04T15:18:05Z · status ready→active, branch
