---
id: "0840"
title: Refresh product documentation to match implementation
type: chore
status: ready
priority: p2
area: docs
assigned_to: ai
created_by: schedule
branch: ""
created_at: "2026-10-18T19:47:40Z"
updated_at: "2026-10-18T19:47:40Z"
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

## Activity

- 2026-10-18T19:47:40Z · created · schedule
