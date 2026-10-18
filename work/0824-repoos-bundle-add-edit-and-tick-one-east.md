---
id: "0824"
title: "repoos bundle: add, edit and tick one easter-egg item without touching the rest"
type: feature
status: review
priority: p3
area: core
depends_on: ["0823"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-bundle-add-edit-and-tick-one-east
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T02:48:55Z"
updated_at: "2026-10-18T06:05:10Z"
---
## Problem
Adding or changing an item in an easter-eggs bundle means editing the body. `repoos update --body` replaces the whole body, and full rewrites have deleted other items' specs (the #0819 bird spec had to be recovered from git history).

## Desired UX
- `repoos bundle add <id> --title ... --area ... --fix "..." --source "..." [--test "..."]` appends one `## Items` line and one `## E<n>` section (next free id) and leaves everything else byte-identical.
- `repoos bundle edit <id> E2 --section "Desired UX" --section-body ...` edits one item's sub-section.
- Per-item status: `repoos bundle done <id> E2` ticks `- [x]` on the item (and `bundle undo`); the engineer/reviewer use it as items land, so progress is visible inside a bundle. Task status is untouched.
- Goes through the RepoOS API, not direct file writes.

## Acceptance criteria
- Tests: add appends exactly one list line + one section; other bytes unchanged; ids increment and never reuse.
- Tests: done/undo toggles only that item's checkbox; unknown id errors clearly.
- Refuses on a task that is not a bundle (title does not start `Easter eggs bundle`) unless `--force`.
- CLI help and user-docs/cli.md updated.

## Notes for AI
Depends on the layout in the "Easter-eggs bundle layout" task; implement against that exact format. Source: driver discussion 2026-10-18 (suggestions 2 and 5).

## Activity

- 2026-10-18T02:48:55Z · created · njachowski@gmail.com
- 2026-10-18T02:49:29Z · depends_on
- 2026-10-18T02:57:28Z · status inbox→ready
- 2026-10-18T05:51:30Z · cli_override, model_override
- 2026-10-18T05:51:32Z · status ready→active, branch
- 2026-10-18T06:05:10Z · status active→review
