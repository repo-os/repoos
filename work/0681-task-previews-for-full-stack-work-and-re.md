---
id: "0681"
title: "Task previews for full-stack work, and reload repoos.toml when it changes"
type: feature
status: inbox
priority: p2
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-10-05T16:58:44Z"
updated_at: "2026-10-05T16:58:44Z"
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

## Activity

- 2026-10-05T16:58:44Z · created · unknown
