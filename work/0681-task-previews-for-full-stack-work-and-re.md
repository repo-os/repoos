---
updated_at: "2026-10-05T21:58:37Z"
review_passes: 1
id: "0681"
title: "Task previews for full-stack work, and reload repoos.toml when it changes"
type: feature
status: review
priority: p2
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/task-previews-for-full-stack-work-and-re
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-05T16:58:44Z"
dev_error_count: 1
---
## Problem

- A task that changes BOTH API and UI (e.g. a new field in an API response plus the shared schema) cannot be verified in its preview: the preview target starts only the branch's web dev server and proxies `/api` to the MAIN checkout's API, so the new UI parses the old response and shows a generic load error (the owner and the driving agent misread it as a UI regression).
- A `[[preview.targets]]` added to `repoos.toml` by a merged task was not picked up by the running server ("No usable [preview] config" until an unrelated config PATCH forced a reload).

## Desired UX

- `[[preview.targets]]` can start several processes per task (e.g. api + web) with ports passed through, or the preview proxy can target the branch's own API; at minimum the preview docs state the limitation and parse failures name the failing field in the UI banner.
- `repoos.toml` is re-read when it changes on disk or after a merge to the primary branch.

## Acceptance criteria

- Test: preview of a task whose branch changes an API field works end to end; test: editing `repoos.toml` on disk (or merging it) updates the running server's preview config without a restart. `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Docs follow-up
The playbook page `user-docs/running-with-agents.md` (landed on main) describes the CURRENT behaviour that this task changes. When this task lands, update the page: section 4, the bullet saying a task preview runs the branch's web code against the primary checkout's API. In short: remove or rewrite it once previews can run both sides. Keep the page accurate rather than aspirational; if this task is declined, leave the page as is. (This replaces the open task 0689, which is being removed.)

## Activity

- 2026-10-05T16:58:44Z · created · unknown
- 2026-10-05T17:16:57Z · story
- 2026-10-05T17:16:59Z · body: section Story context
- 2026-10-05T17:32:23Z · body: section Docs follow-up
- 2026-10-05T19:08:03Z · status inbox→ready
- 2026-10-05T19:08:12Z · status ready→active, branch
- 2026-10-05T19:17:36Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-05T19:23:28Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-05T20:15:35Z · cli_override, model_override
- 2026-10-05T20:15:35Z · needs_input
- 2026-10-05T21:57:47Z · status active→review

