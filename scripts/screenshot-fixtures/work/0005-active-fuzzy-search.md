---
id: "0005"
title: "Fuzzy search over doc contents"
type: feature
status: active
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: "feat/0005-fuzzy-search"
created_at: "2026-08-04T09:17:40Z"
updated_at: "2026-08-06T10:05:00Z"
---
## Activity

- 2026-08-04T09:17:40Z · created · unknown
- 2026-08-06T10:05:00Z · set status active · unknown

## Problem

Search only matches task titles and doc paths, so an ADR decision buried inside
a doc is unfindable, and a typo returns nothing.

## Desired UX

- Typing in the search bar matches INSIDE doc contents, with a short snippet.
- Matching tolerates small typos ("task" finds "tasks", "tasts" still lands).
- Results keep the existing grouping and click-to-open behavior.

## Acceptance criteria

- [ ] A phrase that appears only inside a doc surfaces that doc with context.
- [ ] A near-miss query still returns the right result before the user fixes it.
