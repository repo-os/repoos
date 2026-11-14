---
id: "1113"
title: Build a single-column mobile Work queue
type: feature
status: done
priority: p1
area: web
depends_on: ["1112"]
merged_commit: ccb6d97deb8f8a8227577c964a207cff0f0d6754
assigned_to: ai
created_by: t@t
branch: feat/build-a-single-column-mobile-work-queue
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T09:10:48Z"
updated_at: "2026-11-14T14:49:37Z"
last_close_out_gate_ms: 177335
last_close_out_gate_at: "2026-11-14T14:49:37.236Z"
review_passes: 1
last_check_failure: "repoos check at 2026-11-14T13:50:32.893Z: repoos check failed: ui verification failed (1 issue(s)): [missing-target] Single-column mobile Work queue (target \"default\"): highlight [data-testid=\"mobile-work-queue\"] matched nothing on /work (http://127.0.0.1:46519/work)"
---
## Problem
The desktop Work board uses dense multi-column scanning and pointer-oriented interactions. It is difficult to scan and operate on a phone.

## Desired UX
Below the mobile breakpoint, Work is a readable vertical task queue with obvious creation, filtering and sorting controls. Desktop Work remains intact.

## Acceptance criteria
- Implement dedicated mobile Work composition; do not reuse desktop board DOM/CSS for the narrow queue.
- Show task number, title, type, priority, status and updated time on readable wrapping cards.
- Provide prominent touch-sized New task action wired to existing creation flow and shared mutation.
- Provide compact status filtering and updated-time sorting, with an obvious reset to the unfiltered queue.
- Reuse active shared task store and existing loading, mutation, network error and retry behavior.
- Ensure every action works without hover and the page has no horizontal overflow.
- Add coverage for card content, loading/empty/filtered-empty/error-retry states, create flow and desktop unaffected behavior.
## Notes for AI
Read ADR 0011 and the shell contract in #1112. Inspect and reuse the existing task store, creation flow, formatters and mutation handling. Keep server/session behavior out of scope.

## Shots
```json
[
{
"label": "Single-column mobile Work queue",
"target": "default",
"route": "/work",
"highlight": "[data-testid=\"mobile-work-queue\"]",
"viewportWidth": 390,
"viewportHeight": 844
}
]
```

## Activity

- 2026-11-14T09:10:48Z · created · t@t
- 2026-11-14T09:10:51Z · needs_input
- 2026-11-14T09:11:40Z · depends_on, body: Desired UX (added); Acceptance criteria (added 6, removed 6); Notes for AI (added); Desired outcome (removed)
- 2026-11-14T09:22:34Z · needs_input
- 2026-11-14T13:18:48Z · cli_override, model_override
- 2026-11-14T13:18:53Z · status inbox→ready
- 2026-11-14T13:18:56Z · status ready→active, branch
- 2026-11-14T13:23:22Z · body
- 2026-11-14T13:32:39Z · body
- 2026-11-14T13:37:31Z · body
- 2026-11-14T13:41:49Z · CTO nudge: held — handoff gate is running
- 2026-11-14T13:42:05Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Single-column mobile Work queue (target "default"): highlight [data-testid="mobile-work-queue"] matched nothing on /work (http://127.0.0.1:34977/work)
- 2026-11-14T13:42:05Z · message_queued at 2026-11-14T13:42:05.496Z
- 2026-11-14T13:42:40Z · message_delivered: 1 message(s)
- 2026-11-14T13:43:04Z · body
- 2026-11-14T13:45:50Z · body
- 2026-11-14T13:46:49Z · CTO nudge: held — handoff gate is running
- 2026-11-14T13:50:29Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Single-column mobile Work queue (target "default"): highlight [data-testid="mobile-work-queue"] matched nothing on /work (http://127.0.0.1:46519/work)
- 2026-11-14T13:50:29Z · message_queued at 2026-11-14T13:50:29.740Z
- 2026-11-14T13:50:32Z · message_delivered: 1 message(s)
- 2026-11-14T13:57:36Z · body
- 2026-11-14T14:00:44Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-14T14:00:45Z · status active→review
- 2026-11-14T14:00:45Z · message_queued at 2026-11-14T14:00:45.522Z
- 2026-11-14T14:01:44Z · note: review pass 1: good to go
- 2026-11-14T14:49:37Z · close-out gate completed in 177s

