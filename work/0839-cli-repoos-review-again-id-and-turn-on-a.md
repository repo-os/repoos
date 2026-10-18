---
id: "0839"
title: "CLI: repoos review again <id>, and turn on Auto-refresh stale review evidence by default"
type: feature
status: inbox
priority: p3
area: [core, web]
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-18T16:14:59Z"
updated_at: "2026-10-18T16:14:59Z"
---
## Problem
After `repoos verify <id>` refreshes stale evidence, nothing re-runs the review unless a person clicks **Review again** in the UI (`POST /api/tasks/:id/review/again`); `repoos review <id>` fails with "handoff request failed (200)" on a task already in review. With Settings -> General "Auto-refresh stale review evidence once" off (the default), a stale-evidence-only verdict waits indefinitely (#0832 sat for hours).

## Desired UX
- `repoos review again <id>` calls the same endpoint (one-shot auth like start/done) and prints the outcome.
- Decide whether Auto-refresh stale review evidence once should default on; if so change the default with the Settings control and docs kept in sync.

## Acceptance criteria
- Test: the CLI command posts to the endpoint, renders ok and refusal reasons.
- Test (if the default changes): a stale-evidence-only verdict triggers one automatic refresh and review without a click.
- CLI help, user-docs/cli.md and the Settings copy updated.

## Notes for AI
Do not bypass the review lock rules (no live engineer/close-out). Source: driver observation 2026-10-18 (#0832).

## Activity

- 2026-10-18T16:14:59Z · created · njachowski@gmail.com
