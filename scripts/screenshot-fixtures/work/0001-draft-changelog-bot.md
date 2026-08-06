---
id: "0001"
title: "Proposed: weekly changelog bot"
type: feature
status: draft
priority: p3
area: docs
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-08-01T09:00:00Z"
updated_at: "2026-08-01T09:00:00Z"
---
## Activity

- 2026-08-01T09:00:00Z · created · unknown

## Problem

Releases accumulate done tasks that never make it into the changelog. A small
bot could compile "done since last tag" into a draft release note every week.

## Desired UX

- `repoos changelog --from v0.2.0` prints a grouped markdown changelog.
- Output is a draft, not a push: it opens in the editor for human review.
