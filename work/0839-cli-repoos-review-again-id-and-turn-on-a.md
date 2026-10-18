---
id: "0839"
title: "CLI: repoos review again <id>, and turn on Auto-refresh stale review evidence by default"
type: feature
status: review
priority: p3
area: [core, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/cli-repoos-review-again-id-and-turn-on-a
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T16:14:59Z"
updated_at: "2026-10-18T17:11:23Z"
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
- 2026-10-18T16:58:11Z · status inbox→ready
- 2026-10-18T16:58:20Z · cli_override, model_override
- 2026-10-18T16:58:22Z · status ready→active, branch
- 2026-10-18T17:00:45Z · body
- 2026-10-18T17:02:01Z · body
- 2026-10-18T17:11:21Z · status active→review
- 2026-10-18T17:11:23Z · note: shots: skipped — Docs site skipped: no docs shot declared
