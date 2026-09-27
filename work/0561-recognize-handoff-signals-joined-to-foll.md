---
id: "0561"
title: Recognize handoff signals joined to following text
type: bug
status: inbox
priority: p1
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-27T23:54:49Z"
updated_at: "2026-09-27T23:54:49Z"
---
Cursor engineer replies can render `::repoos-handoff-ready::` at the start of a line with the next sentence attached. RepoOS currently requires the token to occupy the entire line, so completed, green tasks remain active with a dev-error. Accept a handoff token at the start of a line even when immediately followed by prose, while preserving protection against incidental inline mentions. Cover Cursor structured output and negative cases in focused tests. Keep RepoOS-owned validation and review gates intact.

## Activity

- 2026-09-27T23:54:49Z · created · unknown
