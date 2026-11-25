---
id: "1289"
title: "QA pass: Hub pull-to-refresh and parallel close-outs"
type: chore
status: inbox
human_step_override: Cleared needs-human-step flag (sticky until acceptance criteria change)
human_step_override_key: 6ef3a4ce
priority: p2
area: [core, server, web]
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-25T08:29:48Z"
updated_at: "2026-11-25T08:29:53Z"
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
