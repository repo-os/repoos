---
id: "0684"
title: "Per-task overrides: reject silently-ignored fields and show the effective agent and model"
type: bug
status: inbox
priority: p2
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T16:58:50Z"
updated_at: "2026-10-05T17:17:05Z"
---
## Problem

`cliOverride`/`modelOverride` in the body of `POST /api/tasks/:id/start` and `POST /api/tasks/:id/message` are accepted (HTTP 200) but ignored; those handlers read them only for the PM agent. Only `PATCH /api/tasks/:id {cliOverride, modelOverride}` takes effect. A driving agent believed for ~2 hours that two tasks ran on Cursor when they ran on DeepSeek.

## Desired UX

Unknown or ignored fields produce a 400 naming the right endpoint; the task card and the run header show the EFFECTIVE agent + CLI + model; `repoos update <id> --engineer-cli --engineer-model` (or similar) exists.

## Acceptance criteria

- Tests for the 400s and for the effective-agent display; docs list which endpoints take which override. `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Activity

- 2026-10-05T16:58:50Z · created · unknown
- 2026-10-05T17:17:05Z · story
