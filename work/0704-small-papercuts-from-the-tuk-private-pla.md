---
id: "0704"
title: Small papercuts from the tuk-private planning run
type: chore
status: active
priority: p3
area: [cli, server]
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/small-papercuts-from-the-tuk-private-pla
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T03:16:00Z"
updated_at: "2026-10-08T15:41:14Z"
check_retry_count: 2
last_check_failure: "repoos check at 2026-10-08T15:38:39.558Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
---
## Problem

Low-severity items: (1) `repoos list` runs long titles into the area column with no space (`... completed ridemobile`), here and in the RepoOS repo; (2) PM-created tasks get `created_by: ""` and activity `created · unknown`, API-created stories `created_by: unknown`; (3) a CLI handoff logs `active→review`, `review→active`, `active→review` within one second; (4) `repoos doctor` does not notice `AGENTS.md` naming paths that do not exist (`packages/`, a root `justfile`).

## Desired UX

Tidy board output and activity logs that say who did what.

## Acceptance criteria

- [ ] `repoos list` truncates titles to the column with an ellipsis (or guarantees two spaces before the area).
- [ ] Creator recorded for PM/API/CLI writes (`pm`, `api`, the CLI user, `repoos-init`).
- [ ] An intercepted CLI handoff logs one request line and the final transition only.
- [ ] Optional: doctor warns (never fails) for backticked paths in `AGENTS.md` that do not exist.
- [ ] Each item fixed or declined with a reason in the task activity.

## Notes for AI

Evidence: `~/code/tuk/tuk-private/repoos/docs/repoos-feedback.md` (tuk-private run, 2026-10-06), item 10, 11, 15, 17.

## Activity

- 2026-10-06T03:16:00Z · created · unknown
- 2026-10-06T03:18:29Z · note: Also from the tuk-private run (log items 18-19): (5) `repoos show` omits story, depends_on and paths from its header; (6) GET on a POST-only /api route (e.g. /api/tasks/0004/done) returns index.html with HTTP 200 instead of JSON 404/405.
- 2026-10-06T03:26:49Z · note: Recheck on current code (tuk-private, 2026-10-06): created_by empty and the HTML-200 API response are still present. New (item 21): PATCH /api/config rejects numeric maxActiveTasks 3 ('must be one of: 1, 2, 3, ...'); only the string '3' is accepted.
- 2026-10-08T14:40:50Z · cli_override, model_override
- 2026-10-08T14:40:53Z · status inbox→ready
- 2026-10-08T14:40:54Z · status ready→active, branch
- 2026-10-08T14:48:13Z · body
- 2026-10-08T14:49:11Z · body
- 2026-10-08T15:08:20Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-08T15:09:27Z · body
- 2026-10-08T15:21:40Z · body
- 2026-10-08T15:38:36Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-08T15:39:39Z · body
- 2026-10-08T15:41:14Z · body
