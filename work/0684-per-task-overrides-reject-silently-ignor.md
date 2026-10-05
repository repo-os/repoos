---
id: "0684"
title: "Per-task overrides: reject silently-ignored fields and show the effective agent and model"
type: bug
status: review
priority: p2
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/per-task-overrides-reject-silently-ignor
created_at: "2026-10-05T16:58:50Z"
updated_at: "2026-10-05T20:25:46Z"
---
## Problem

`cliOverride`/`modelOverride` in the body of `POST /api/tasks/:id/start` and `POST /api/tasks/:id/message` are accepted (HTTP 200) but ignored; those handlers read them only for the PM agent. Only `PATCH /api/tasks/:id {cliOverride, modelOverride}` takes effect. A driving agent believed for ~2 hours that two tasks ran on Cursor when they ran on DeepSeek.

## Desired UX

Unknown or ignored fields produce a 400 naming the right endpoint; the task card and the run header show the EFFECTIVE agent + CLI + model; `repoos update <id> --engineer-cli --engineer-model` (or similar) exists.

## Acceptance criteria

- Tests for the 400s and for the effective-agent display; docs list which endpoints take which override. `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Docs follow-up
The playbook page `user-docs/running-with-agents.md` (landed on main) describes the CURRENT behaviour that this task changes. When this task lands, update the page: section 2, the bullet about setting overrides on the task itself and some endpoints ignoring override fields. In short: update to the new validation and the effective-agent display. Keep the page accurate rather than aspirational; if this task is declined, leave the page as is. (This replaces the open task 0689, which is being removed.)

## Activity

- 2026-10-05T16:58:50Z · created · unknown
- 2026-10-05T17:17:05Z · story
- 2026-10-05T17:17:06Z · body: section Story context
- 2026-10-05T17:32:26Z · body: section Docs follow-up
- 2026-10-05T19:08:06Z · status inbox→ready
- 2026-10-05T19:08:13Z · status ready→active, branch
- 2026-10-05T20:25:46Z · status active→review
