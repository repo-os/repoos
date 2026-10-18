---
id: "0825"
title: "Guard: refuse a --body update that drops an easter-egg item"
type: chore
status: review
priority: p3
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/guard-refuse-a-body-update-that-drops-an
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T02:49:07Z"
updated_at: "2026-10-18T03:11:06Z"
---
## Problem
`repoos update <id> --body` already refuses a full replace that drops Problem/Desired UX/Acceptance criteria/Notes for AI, but a bundle's items are `## E<n> · ...` sections and the `## Items` list, which that guard does not know about. A rewrite can delete an item silently.

## Desired UX
A full `--body` replace (CLI and PATCH /api/tasks/:id) on a task whose current body has `## E<n> ·` sections is refused if any E-id section or Items line would disappear, naming the missing ids, unless `--force`. `--section` edits are unaffected.

## Acceptance criteria
- Test: body that omits an existing E2 section is refused naming E2; with `--force` it applies.
- Test: body that keeps all E-ids (even reordered or edited) is accepted.
- Test: non-bundle tasks are unaffected.
- Error text tells the caller to use `--section` or `repoos bundle`.

## Notes for AI
Extend the existing dropped-sections guard rather than adding a parallel one. Source: driver discussion 2026-10-18 (suggestion 3).

## Activity

- 2026-10-18T02:49:07Z · created · njachowski@gmail.com
- 2026-10-18T02:57:33Z · status inbox→ready
- 2026-10-18T02:58:40Z · cli_override, model_override
- 2026-10-18T02:58:43Z · status ready→active, branch
- 2026-10-18T03:00:38Z · body
- 2026-10-18T03:01:40Z · body
- 2026-10-18T03:11:06Z · status active→review
- 2026-10-18T03:11:06Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
