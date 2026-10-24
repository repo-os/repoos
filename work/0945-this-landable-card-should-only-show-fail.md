---
id: "0945"
title: Show only failing checks in Landable by default
type: feature
status: active
needs_input: true
needs_input_reason: check-failed-after-retries
debug_tldr: "Handoff check failed because remote runner mini is offline — restore mini or set remoteValidation.fallbackToLocal, then resume the task and retry handoff."
debug_tldr_at: "2026-10-24T02:05:05Z"
debug_tldr_key: check-failed-after-retries|
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/show-only-failing-checks-in-landable-by-
created_at: "2026-10-24T01:24:41Z"
updated_at: "2026-10-24T07:03:56Z"
last_handoff_failure_fingerprint: "check|remote validation unavailable: host mini skipped: link probe failed — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally"
last_handoff_failure_sha: d4dd2f3a1fac5f9adec8a3b80911134c50706ed6
handoff_signal_retry_count: 2
last_check_failure: "repoos check at 2026-10-24T01:31:21.495Z: repoos check failed: remote validation unavailable: host mini skipped: link probe failed — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally"
engineer_stall_resume_log: "[{\"at\":\"2026-10-24T01:57:26.775Z\",\"reason\":\"clean-exit-without-handoff\"}]"
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
- 2026-10-24T01:57:26Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-10-24T01:58:00Z · body
- 2026-10-24T01:59:34Z · handoff failed · check failed after 2 automatic retries · remote validation unavailable: host mini skipped: link probe failed — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally
- 2026-10-24T02:04:43Z · watchdog: escalated to needs_input · check-failed-after-retries · check failed after 2 automatic retries · remote validation unavailable: host mini skipped: link probe failed — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-10-24T04:01:41Z · note: handoff requested (ui-review)
- 2026-10-24T04:02:07Z · handoff failed · ui-review handoff failed at check · remote validation unavailable: host mini skipped: link probe failed — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally
- 2026-10-24T07:03:56Z · body

