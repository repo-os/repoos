---
id: "0639"
title: Set an explicit stable session id on first launch for pi (cache affinity)
type: feature
status: review
priority: medium
area: core
assigned_to: ai
created_by: ""
branch: feat/set-an-explicit-stable-session-id-on-fir
review_cli_override: codex
review_model_override: gpt-6-luna
created_at: "2026-10-03T15:54:46Z"
updated_at: "2026-10-03T18:06:13Z"
---
## Problem
RepoOS only passes a session id on *resume*, using an id parsed from the harness's output (src/server/agents.ts, launch/resume builders ~L3085-3280). First launches carry none. If the id isn't captured (crash, restart, parse miss), resume silently starts a fresh session and the provider prompt cache goes cold. pi sends its session id to providers (OpenRouter x-session-id, OpenAI prompt_cache_key), so a stable id we choose gives deterministic cache affinity.

## Desired UX
No visible change; lower token cost on pi runs.

## Acceptance criteria
- pi first launch passes --session-id <id> (pi 1.0.0 supports it; creates if missing), id derived deterministically from task id + role (engineer/reviewer/fix-up) and recorded so resume reuses it.
- opencode v2.0.11: check whether a new session can be created with a chosen id; if not, document it and keep the current behavior.
- Resume never falls back to a fresh session when a deterministic id is available.
- Tests cover the launch and resume arg builders.

## Notes for AI
Measurement (14d, sessions table): pi openrouter/z-ai/glm-5.3-flash hit rate 64% vs ~93-97% for opencode models. 389/412 pi and 3404/3552 opencode sessions record no cache tokens at all, so cache misses there are invisible; consider fixing that capture too (separate task). Also worth evaluating pi cacheRetention and keeping the volatile parts of the prompt (timestamps, board state) at the end so the prefix stays stable.

## Activity

- 2026-10-03T15:54:46Z · created · unknown
- 2026-10-03T16:56:25Z · review_cli_override
- 2026-10-03T16:56:27Z · review_model_override
- 2026-10-03T16:56:37Z · status inbox→ready
- 2026-10-03T16:56:39Z · status ready→active, branch
- 2026-10-03T18:06:13Z · status active→review
