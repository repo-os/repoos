---
id: "1274"
title: "QA pass: Agents page model providers and routing status copy"
type: feature
status: done
priority: p2
area: web
merged_commit: bde8a1882645d5d578d1f152ef00dc5a9b9379d4
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-agents-page-model-providers-and-
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T07:26:57Z"
updated_at: "2026-11-20T13:05:02Z"
last_close_out_gate_ms: 540216
last_close_out_gate_at: "2026-11-20T13:04:52.907Z"
review_passes: 1
---
## Problem
Sweep the Agents settings tab (agent list, model providers, routing mode and status text) for layout, wording and state bugs, including the key-missing and paused states.

## Desired UX
Page looks and behaves correctly at 375, 768 and 1280 widths: no overflow, clear labels, plain-English status text, sensible empty and error states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths.
- Every issue found is fixed, covering the whole class of the problem.
- New browser tests are deterministic (explicit waits, fixed viewport) so they pass on slower remote runners.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never show real keys.

## Activity

- 2026-11-20T07:26:57Z · created · t@t
- 2026-11-20T07:27:02Z · status inbox→ready
- 2026-11-20T07:27:04Z · cli_override, model_override
- 2026-11-20T07:27:05Z · status ready→active, branch
- 2026-11-20T07:37:17Z · body
- 2026-11-20T07:40:42Z · CTO nudge: held — handoff gate is running
- 2026-11-20T07:41:43Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-20T07:41:43Z · status active→review
- 2026-11-20T07:41:44Z · message_queued at 2026-11-20T07:41:44.096Z
- 2026-11-20T07:43:41Z · note: review pass 1: good to go
- 2026-11-20T08:54:36Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T13:04:52Z · close-out gate completed in 540s
- 2026-11-20T13:05:02Z · message_dropped: 1 queued message(s) discarded — task is done
