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
updated_at: "2026-10-08T17:49:30Z"
review_rounds: 1
review_passes: 1
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
- 2026-10-08T15:43:26Z · body
- 2026-10-08T15:44:13Z · body
- 2026-10-08T15:46:02Z · body
- 2026-10-08T15:46:49Z · body
- 2026-10-08T15:57:31Z · handoff failed · check failed after 2 automatic retries · server-side finalization timed out (deadline exceeded)
- 2026-10-08T16:02:39Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-08T16:02:40Z · status review→active
- 2026-10-08T16:12:39Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-08T16:21:38Z · watchdog: restarted engineer after identical check failure · branch tip unchanged since the last failing handoff validation
- 2026-10-08T16:23:16Z · body
- 2026-10-08T16:24:38Z · body
- 2026-10-08T16:32:23Z · handoff failed · remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on bee — fix it in the feature branch and re-run the gate
- 2026-10-08T16:32:24Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-08T16:37:36Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-08T16:37:36Z · status review→active
- 2026-10-08T16:42:37Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-08T16:42:38Z · status review→active
- 2026-10-08T16:57:39Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-08T17:02:39Z · watchdog: restarted engineer after identical check failure · branch tip unchanged since the last failing handoff validation
- 2026-10-08T17:04:30Z · body
- 2026-10-08T17:06:17Z · body
- 2026-10-08T17:12:21Z · handoff failed · remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on bee — fix it in the feature branch and re-run the gate
- 2026-10-08T17:17:39Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-08T17:17:39Z · status review→active
- 2026-10-08T17:23:09Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on bee — fix it in the feature branch and re-run the gate
- 2026-10-08T17:28:39Z · watchdog: restarted engineer after identical check failure · branch tip unchanged since the last failing handoff validation
- 2026-10-08T17:40:24Z · body
- 2026-10-08T17:46:17Z · status active→review
- 2026-10-08T17:46:17Z · note: shots: skipped — the diff (20 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-08T17:47:45Z · note: review pass 1: needs some work
- 2026-10-08T17:47:45Z · status review→active
- 2026-10-08T17:49:28Z · note: Item 1 (repoos list): fixed — truncatePad() pads titles so the area column stays aligned.
- 2026-10-08T17:49:30Z · note: Item 2 (created_by): fixed — resolveApiCreator/resolveCliCreator on API, CLI, and story creates; activity uses the resolved label.
