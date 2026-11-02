---
id: 1007
title: Engineering reports for each task work round
type: feature
status: active
priority: p2
area: [core, server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/engineering-reports-for-each-task-work-r
created_at: "2026-11-01T18:38:06Z"
updated_at: "2026-11-02T02:45:18Z"
---
## Problem

Task history shows the final diff and review verdict, but it does not preserve why the engineer chose an approach, what alternatives or failed attempts they tried, what blockers they encountered, or which lessons will help the next engineer. Reviewers often lack that context when assessing the implementation.

## Desired UX

At the end of each engineering round, the engineer produces a concise, durable report after the round’s checks pass and before requesting review. The reviewer reads that report as part of the review. The task Dev tab gains a Report / Chat toggle and a table of engineering rounds, presented consistently with the existing review history.

Each report starts with a TL;DR, then explains what changed and why, approaches tried and what worked or did not, issues or blockers, and useful learnings for future engineers. Aim for 500–600 words and enforce a maximum of 1,000 words. Include a deterministic change summary listing files changed and lines added/removed per file for that round; compute it from recorded Git trees rather than asking the model to count or author it.

## Acceptance criteria

- Persist one report per engineering round as a task-associated, durable artifact that remains available to reviewers and future engineers after the task is merged into main.
- Record round identity, timestamp, coding agent, model, and source-tree identifiers needed to relate the report to the reviewed change.
- Generate the report after the round’s checks pass and before handoff. Ensure it is included in the review context and cannot silently describe a different source tree than the one being reviewed; handle another engineering round after review feedback as a separate report.
- Use a concise report template with TL;DR first, work and rationale, attempted approaches and outcomes, challenges/blockers, and key learnings. Target 500–600 words, with a hard 1,000-word maximum and clear handling when the report exceeds it.
- Generate the changed-file list and per-file line additions/deletions deterministically from the round’s recorded base and final trees, including file additions, deletions, and renames. Keep this generated section distinct from the engineer-authored narrative.
- Require reviewers to read the report and consider its rationale, experiments, and known limitations when producing their review verdict.
- Add a Report / Chat toggle in the task Dev tab and a table of reports with at least round/pass, time, engineer/coding agent, and model. Selecting a row opens the report in a presentation consistent with the Review tab’s reports.
- Test report creation and reviewer delivery, deterministic diff summaries, retries and multiple rounds, missing or stale reports, word limits, and report selection in the UI. Document the lifecycle and report format.

## Notes for AI
Inspect the engineer session lifecycle, handoff checkpoint/commit flow, reviewer prompt construction, and task Dev and Review tabs before choosing storage or UI changes. Keep one immutable report per engineering round and tie it to the exact source diff the reviewer sees. Use RepoOS-managed task/report APIs and lifecycle hooks; do not hand-edit work task files or infer Git line counts from agent prose. Make the report durable in the repository after close-out, and ensure report generation cannot make a passing source check appear to validate a different tree. Preserve reports across review feedback rounds and keep legacy tasks without reports reviewable. Update the engineering and reviewer instructions plus user docs. Run the scoped check before handoff.

## Shots
```json
[
{
"label": "Task engineering report history",
"target": "default",
"route": "/work?task=1007&tab=agent",
"highlight": ".engineering-report-view",
"steps": [
{
"click": "[data-test-id=\\\"engineering-report-tab\\\"]"
}
]
}
]
```

## Activity

- 2026-11-01T18:38:06Z · created · njachowski@gmail.com
- 2026-11-01T18:38:07Z · needs_input
- 2026-11-01T18:38:31Z · needs_input, body: Notes for AI (added)
- 2026-11-01T18:38:54Z · status inbox→ready
- 2026-11-02T02:14:13Z · status ready→active, branch
- 2026-11-02T02:25:09Z · body
- 2026-11-02T02:30:50Z · message_queued at 2026-11-02T02:30:50.063Z
- 2026-11-02T02:30:50Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-02T02:35:50Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-02T02:41:16Z · body
- 2026-11-02T02:45:17Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-02T02:45:18Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-02T02:45:18Z · message_delivered: 1 message(s)
