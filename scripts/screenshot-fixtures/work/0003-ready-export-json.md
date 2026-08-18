---
id: "0003"
title: "Add repoos export --json"
type: feature
status: ready
priority: p1
area: cli
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-08-03T11:30:00Z"
updated_at: "2026-08-05T08:00:00Z"
---
## Activity

- 2026-08-03T11:30:00Z · created · unknown
- 2026-08-05T08:00:00Z · set status ready · unknown

## Problem

CI and external dashboards want the board as data, not as markdown parsing.

## Desired UX

- `repoos export --json` dumps every task with normalized frontmatter.
- `--status active` filters; output is stable, key-ordered, and JSON5-free.
