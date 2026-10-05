---
id: "0682"
title: "Config and git hygiene: stable repoos.toml writes, auto-commit config/bookkeeping writes, init .gitignore covers attachments"
type: bug
status: inbox
priority: p2
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-10-05T16:58:46Z"
updated_at: "2026-10-05T16:58:46Z"
---
## Problem

- `PATCH /api/config` rewrites the whole `repoos.toml` (reordering `[[agents]]` relative to other tables: a 35+/37- diff for a one-line change) and leaves main dirty. A dirty primary branch blocks the next Move to done until someone commits it.
- RepoOS bookkeeping writes (`repoos/work/00XX.md` after a failed handoff) were also left uncommitted on main.
- `repoos init`'s `.gitignore` does not ignore `repoos/work/.attachments/` (the RepoOS repo's own does); screenshots from `repoos shot` then dirty main and block Move to done.

## Desired UX

Config writes preserve key order and formatting, are committed automatically like task files, and a fresh project's `.gitignore` already contains `repoos/work/.attachments/` and `inputs/.attachments/`.

## Acceptance criteria

- Round-trip test: patching one key changes only that line; auto-commit on config and bookkeeping writes; init template test for the `.gitignore` entries. `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Activity

- 2026-10-05T16:58:46Z · created · unknown
