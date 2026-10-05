---
id: "0682"
title: "Config and git hygiene: stable repoos.toml writes, auto-commit config/bookkeeping writes, init .gitignore covers attachments"
type: bug
status: active
priority: p2
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/config-and-git-hygiene-stable-repoos-tom
created_at: "2026-10-05T16:58:46Z"
updated_at: "2026-10-05T18:45:35Z"
handoff_signal_retry_count: 1
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

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Activity

- 2026-10-05T16:58:46Z · created · unknown
- 2026-10-05T17:17:00Z · story
- 2026-10-05T17:17:01Z · body: section Story context
- 2026-10-05T18:04:06Z · status inbox→ready
- 2026-10-05T18:04:14Z · status ready→active, branch
- 2026-10-05T18:45:35Z · note: shots: skipped — the diff (7 changed paths) touches no [[preview.paths]] globs — no UI change to capture
