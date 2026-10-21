---
id: "0896"
title: "Driver rule: re-read live task state before every action, never trust memory or loop prompts"
type: feature
status: inbox
priority: p2
area: docs
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-21T10:43:50Z"
updated_at: "2026-10-21T10:43:50Z"
---
## Problem
Driver agents repeatedly act on remembered or stale state instead of the live board. 2026-10-21: the overnight loop prompt said story #0011's chain had not started; the driver reopened already-landed #0879 (done→ready→active) and started an engineer on it. Other occurrences: acting on a remembered task status, landing candidate or engineer count that had changed since the last check.

## Desired UX
Driver guidance says plainly: before ANY action on a task (start, restart, message, override, land, mv), re-read its current state fresh — `repoos list`, `repoos landable <id>`, and for 'not started' claims the merge history on main (`git log main --grep <id>`). Memory, summaries, handoff docs and loop prompts are hints, never facts. A task found already done/landed is never reopened.

## Acceptance criteria
- docs/driver-notes.md gets a dated entry with the rule and the #0879 incident.
- AGENTS.md driver paragraph and the `repoos driver brief` output (src/commands/driver.ts / its server assembler) carry a one-line 'verify live state first' reminder.
- `repoos start`/`mv ... ready` on a task whose branch is already merged into main refuses with a clear message unless forced (guard, with a test).

## Notes for AI
Docs plus a small guard. Do not edit work/*.md by hand.

## Activity

- 2026-10-21T10:43:50Z · created · njachowski@gmail.com
