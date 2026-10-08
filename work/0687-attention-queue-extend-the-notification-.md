---
id: "0687"
title: "Attention queue: extend the notification bell with provider failures, spend threshold, awaiting-visual-check, remote fallback; expose one API feed"
type: feature
status: done
priority: p2
area: ui
story: "Field report: first agent-driven project run (opex)"
merged_commit: d92db482b4cb445968094c7e02a02b42a5908411
assigned_to: ai
created_by: ""
branch: feat/attention-queue-extend-the-notification-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-05T16:58:57Z"
updated_at: "2026-10-05T23:34:40Z"
merge_conflict_retry_count: 1
review_passes: 2
review_rounds: 1
---
## Problem

The bell (top bar, also on the Control page) already lists close-out outcomes, release events and "Tasks needing you" (review hand-offs, needs-input flags, branch drift), with per-type sound/push toggles. Driving a project showed what is missing: (1) provider/credit failures (HTTP 402, "model unavailable") never reach it; (2) a silent run is not clearly flagged (see provider-failures task); (3) no spend-over-threshold alert; (4) no "UI task awaiting human visual verification" state; (5) a close-out that silently fell back to local although remote validation was enabled; (6) no single machine-readable feed: the pieces exist (`GET /api/close-out/outcomes`, task flags from `GET /api/tasks`) but `/api/notices` does not exist, so scripts and agents must reassemble it (a driver script polled job files).

## Desired UX

Items (1)-(5) appear in the bell with their own toggles, and the same feed is available as `GET /api/attention` (+ an SSE event) with stable ids, severity, task id, kind, message and timestamps, so agents and scripts consume one source.

## Acceptance criteria

- Tests per new notice kind; API contract tests; docs/user-docs/notifications.md updated; Settings toggles per type (repo rule: every user-facing setting needs a Settings control). `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Docs follow-up
The playbook page `user-docs/running-with-agents.md` (landed on main) describes the CURRENT behaviour that this task changes. When this task lands, update the page: section 6 or 4 (wherever you describe how you notice problems). In short: point at the extended notification bell and the single attention feed. Keep the page accurate rather than aspirational; if this task is declined, leave the page as is. (This replaces the open task 0689, which is being removed.)

## Shots
```json
[
{
"label": "Spend alert threshold in Notifications settings",
"target": "default",
"route": "/settings?tab=notifications"
},
{
"label": "Notification bell with extended attention feed",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"notice-bell-trigger\"]"
}
]
```

## Activity

- 2026-10-05T16:58:57Z · created · unknown
- 2026-10-05T17:17:12Z · story
- 2026-10-05T17:17:14Z · body: section Story context
- 2026-10-05T17:32:28Z · body: section Docs follow-up
- 2026-10-05T22:02:16Z · status inbox→ready
- 2026-10-05T22:02:18Z · cli_override, model_override
- 2026-10-05T22:02:19Z · status ready→active, branch
- 2026-10-05T22:41:50Z · body: section Shots
- 2026-10-05T22:46:40Z · status active→review
- 2026-10-05T22:48:02Z · status review→active
- 2026-10-05T23:02:52Z · status active→review
- 2026-10-05T23:34:40Z · status review→done, release:success
