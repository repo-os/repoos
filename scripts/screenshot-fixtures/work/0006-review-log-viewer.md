---
id: "0006"
title: "Interactive log viewer"
type: feature
status: review
priority: p1
area: cli
assigned_to: ai
created_by: ""
branch: "feat/0006-log-viewer"
created_at: "2026-08-05T09:00:00Z"
updated_at: "2026-08-06T12:00:00Z"
---
## Activity

- 2026-08-05T09:00:00Z · created · unknown
- 2026-08-06T12:00:00Z · set status review · unknown

## Problem

`repoos log` prints a flat wall of text. Navigating a task's history needs
paging, filtering, and a glanceable diff.

## Desired UX

- A paged, filterable log with per-task activity grouped by date.
- `--status done` shows "merged to main" at a glance via colored markers.
