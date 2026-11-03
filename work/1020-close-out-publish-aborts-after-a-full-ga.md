---
id: 1020
title: Close-out publish aborts after a full gate when main has only live tasks' own task files dirty
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-publish-aborts-after-a-full-ga
created_at: "2026-11-03T19:45:56Z"
updated_at: "2026-11-03T20:12:48Z"
---
## Problem
On 2026-11-03 #1004's Move to done passed its full close-out gate (1,425 s, finished 16:08) and then refused at the publish step: "main has 2 uncommitted files at publish time, so the merge would abort: work/1015-….md, work/1017-….md. The candidate was NOT merged". Those two files are the task files of tasks that were active at that moment: the server rewrites a live task's file (status, activity, body updates) on `main` as it works. The refusal cost a full 24-minute gate, and a manual retry was needed. The same dirty-live-task-file state briefly blocked #1005 and showed as a failing "Main clean" landing check on #1004 and #1005 earlier. With several engineers running (as now), close-out collides with this often.

## Desired UX
Move to done does not fail, or burn a gate, because `main` has uncommitted bookkeeping files of other live tasks. Either the server commits (checkpoints) a live task's task-file changes promptly so `main` is rarely dirty, or the publish step tolerates a dirty `work/<other-id>-*.md` that the merge does not touch, or it retries the publish a few times after the next checkpoint instead of failing after the gate.

## Acceptance criteria
- [ ] Reproduce: run a close-out while another active task's file is dirty on `main`; show the current abort.
- [ ] Fix so a dirty task file that the candidate merge does not modify never aborts publish (and never gets overwritten or lost), or is checkpoint-committed first; keep refusing for any dirty source file, `repoos.toml` edits (existing rule), or a dirty file the merge would touch.
- [ ] If the publish must still wait, it retries within a bounded window and logs why, instead of failing after the gate.
- [ ] Update `docs/close-out-pipeline.md` (the Main clean row and the publish section); add tests including the dirty-file-the-merge-touches case.

## Notes for AI
Evidence: #1004 activity at 16:08 (gate completed in 1425s) and the CTO brief entry "main has 2 uncommitted files at publish time". Start at the publish step in `src/server/integration-orchestrator.ts` and the main-dirty check in `src/core/landable.ts` / `src/server/landable.ts` (`mainDirty`). Never auto-commit `repoos.toml` or source files; see AGENTS.md "Direct commits to main" and "Exception: Move to done blocked by repoos.toml".

## Activity

- 2026-11-03T19:45:56Z · created · njachowski@gmail.com
- 2026-11-03T19:46:00Z · status inbox→ready
- 2026-11-03T19:46:37Z · status ready→active, branch
- 2026-11-03T20:02:10Z · message_queued at 2026-11-03T20:02:10.849Z
- 2026-11-03T20:02:11Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-03T20:07:10Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T20:12:48Z · body
