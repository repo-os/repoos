---
id: "0733"
title: Show review records in a table
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/show-review-records-in-a-table
created_at: "2026-10-07T02:52:02Z"
updated_at: "2026-10-07T03:04:53Z"
---
## Problem

The report records section is useful, but its current presentation is not as clear as the simple table on the Tokens page. Review records also need to be ordered with the latest review first, avoid showing the most recent review data twice, and identify the coding agent and model used for each review run.

## Desired UX

Show review records in a simple table styled consistently with the Tokens page. List the latest review first, show each review's data only once, and include the reviewer coding agent and model for every run.

## Acceptance criteria

- [ ] Review records are displayed in a simple table consistent with the Tokens page style.
- [ ] Records are ordered from latest review to oldest.
- [ ] The most recent review's data appears only once.
- [ ] Each review record shows the reviewer coding agent and model.

## Notes for AI

- Follow the existing Tokens page table style rather than introducing a new visual treatment.
- Use the existing review record data; do not add unrelated fields or behavior.
- Assume “most recent review data” refers to the latest review appearing in the records section, not a separate summary elsewhere.

## Scope

This task covers the presentation, ordering, and per-run reviewer/model information in the report records section.

## Original prompt

This new report records section is useful but let's make it a proper table , like on the tokens page (that style is good, simple) . but re-order so the latest review is at the top (and don't duplicate the most recent review data, just show each once). also show the reviewer coding agent + model for each run.

## Screenshots

![Screenshot-2026-10-07-at-10.49.17](/api/tasks/0733/attachments/screenshot-1.png)

## Activity

- 2026-10-07T02:52:02Z · created · hello@repoos.org
- 2026-10-07T02:52:04Z · screenshots
- 2026-10-07T02:52:23Z · status draft→inbox, title, area, body
- 2026-10-07T02:58:15Z · status inbox→ready
- 2026-10-07T02:58:15Z · status ready→active, branch
- 2026-10-07T03:03:54Z · body
- 2026-10-07T03:04:53Z · body
