---
id: "0945"
title: Show only failing checks in Landable by default
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/show-only-failing-checks-in-landable-by-
created_at: "2026-10-24T01:24:41Z"
updated_at: "2026-10-24T01:52:26Z"
handoff_signal_retry_count: 2
check_retry_count: 2
last_check_failure: "repoos check at 2026-10-24T01:31:21.495Z: repoos check failed: remote validation unavailable: host mini skipped: link probe failed — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally"
---
## Problem

The Landable card shows more information than needed by default, making failing checks harder to spot.

## Desired UX

By default, show failing checks and keep the rest minimized. Let users toggle the card to expand and show all checks.

## Acceptance criteria

- [ ] The Landable card shows failing checks by default.
- [ ] Non-failing checks are minimized by default.
- [ ] A user can toggle the card to expand and show all checks.

## Notes for AI

- Assume the toggle expands or minimizes all non-failing checks together.
- Keep the existing Landable checks and their results available; this changes their default presentation, not what the card evaluates.

## Original prompt

This Landable card should only show failing and minimise the rest -- if user clicks to toggle and expand all then you can show all, but show less by default (just failing)

## Screenshots

![Screenshot-2026-10-24-at-08.59.05](/api/tasks/0945/attachments/att_d142c3b9-8f26-4087-99db-89c3a53bb88a.png)

## Shots
```json
[
{
"label": "Landable card with failing checks shown by default",
"target": "default",
"route": "/work?task=9999",
"highlight": ".landable-checks",
"state": "drawer:landable"
}
]
```

## Activity

- 2026-10-24T01:24:41Z · created · hello@repoos.org
- 2026-10-24T01:24:53Z · screenshots
- 2026-10-24T01:25:17Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
- 2026-10-24T01:26:27Z · status inbox→ready
- 2026-10-24T01:26:32Z · status ready→active, branch
- 2026-10-24T01:27:15Z · body
- 2026-10-24T01:32:11Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-24T01:37:30Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-24T01:43:11Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-24T01:51:27Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-10-24T01:52:26Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
