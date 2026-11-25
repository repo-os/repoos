---
last_close_out_gate_ms: 1506790
last_close_out_gate_at: "2026-11-25T11:21:25.113Z"
id: "1289"
title: "QA pass: Hub pull-to-refresh and parallel close-outs"
type: chore
status: review
human_step_override: Cleared needs-human-step flag (sticky until acceptance criteria change)
human_step_override_key: 6ef3a4ce
priority: p2
area: [core, server, web]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-hub-pull-to-refresh-and-parallel
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-25T08:29:48Z"
updated_at: "2026-11-25T11:21:25Z"
review_passes: 1
---
## Problem
Two features just landed and have had little real-world testing: Hub server list pull-down-to-refresh (#1286) and parallel close-out validation (#1275). #1275 also went through many review rounds.

## Desired UX
Both behave as their tasks describe. Defects found are fixed with tests. New UI ideas are written up as proposals, not built.

## Acceptance criteria
- Exercise pull-to-refresh logic (mobile/src/components/ServerListView.vue): scroll conflicts, row menus, all-unreachable and timeout cases, using automated tests only.
- Exercise the close-out scheduler (src/server/close-out-scheduler.ts) edge cases: crash recovery, parked publishers, status reporting, lock timeouts.
- Report lists what was tested, what was fixed and what automated tests could not cover.

## Notes for AI
Never run repoos serve or touch real runner hosts. Do not change repoos.toml. File larger findings as separate tasks.

## Activity

- 2026-11-25T08:29:48Z · created · t@t
- 2026-11-25T08:29:49Z · needs_input
- 2026-11-25T08:29:53Z · body: Acceptance criteria (added 2, removed 2)
- 2026-11-25T08:29:53Z · needs_input
- 2026-11-25T08:29:54Z · cli_override, model_override
- 2026-11-25T08:30:03Z · status inbox→ready
- 2026-11-25T08:30:04Z · status ready→active, branch
- 2026-11-25T08:37:57Z · body
- 2026-11-25T08:42:21Z · body
- 2026-11-25T08:44:00Z · status active→review
- 2026-11-25T08:44:00Z · message_queued at 2026-11-25T08:44:00.297Z
- 2026-11-25T08:44:00Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-25T08:44:53Z · note: review pass 1: good to go
- 2026-11-25T09:45:14Z · message_overdue: still queued after 60m without being delivered
- 2026-11-25T10:56:14Z · close-out gate completed in 3189s
- 2026-11-25T11:21:25Z · close-out gate completed in 1507s

