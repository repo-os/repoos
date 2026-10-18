---
id: "0001"
title: Product documentation audit
enabled: true
cadence: weekly
timezone: America/New_York
time_of_day: "09:00"
run_at: ""
day_of_week: 1
task_title: Refresh product documentation to match implementation
task_type: chore
task_area: docs
task_priority: p2
task_assigned_to: ai
task_status: ready
auto_start_agent: false
last_run_at: ""
last_result: ""
last_task_id: ""
last_error: ""
last_occurrence_key: ""
created_at: "2026-10-18T12:00:00Z"
updated_at: "2026-10-18T12:00:00Z"
---
## Problem

Product and architecture documentation can drift from the implementation when
features land without doc updates.

## Desired UX

A reader should get an accurate picture of what RepoOS does today from README,
vision, roadmap, concepts, and architecture — with future work clearly
separated.

## Acceptance criteria

- [ ] Audit `README.md`, `docs/vision.md`, `docs/roadmap.md`, `docs/concepts.md`,
  and `docs/architecture.md` against the current source tree.
- [ ] Fix stale claims; link to `work/` for live task status instead of
  duplicating the board.
- [ ] `repoos check` passes after any documentation edits.

## Notes for AI

This schedule recreates the maintenance intent of task #0092 on a weekly cadence.
See `docs/scheduled-tasks.md` for catch-up and deduplication behavior.
