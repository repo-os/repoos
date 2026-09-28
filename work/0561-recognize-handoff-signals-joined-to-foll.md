---
id: "0561"
title: Recognize handoff signals joined to following text
type: bug
status: review
priority: p1
area: server
assigned_to: human
created_by: ""
branch: feat/recognize-handoff-signals-joined-to-foll
created_at: "2026-09-27T23:54:49Z"
updated_at: "2026-09-28T00:03:56Z"
---
Cursor engineer replies can render `::repoos-handoff-ready::` at the start of a line with the next sentence attached. RepoOS currently requires the token to occupy the entire line, so completed, green tasks remain active with a dev-error. Accept a handoff token at the start of a line even when immediately followed by prose, while preserving protection against incidental inline mentions. Cover Cursor structured output and negative cases in focused tests. Keep RepoOS-owned validation and review gates intact.

## Activity

- 2026-09-27T23:54:49Z · created · unknown
- 2026-09-27T23:55:25Z · branch, assigned_to
- 2026-09-27T23:55:26Z · status inbox→active
- 2026-09-28T00:03:56Z · status active→review
