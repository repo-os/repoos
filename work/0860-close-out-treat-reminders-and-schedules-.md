---
id: "0860"
title: "Close-out: treat reminders/ and schedules/ as server-written bookkeeping, like work/ inputs/ stories/"
type: bug
status: inbox
priority: p2
area: server
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-20T04:20:16Z"
updated_at: "2026-10-20T04:20:16Z"
---
## Problem
Move to done refuses to publish when a reminder file is dirty on main: "main has 1 uncommitted file at publish time, so the merge would abort: reminders/37fba592-....md. The candidate was NOT merged; commit or stash those on main (or use 'Commit & continue') and retry." Reminders (#0851) are server-written, repo-native files exactly like tasks, inputs and stories, but the close-out only knows `work/`, `inputs/` and `stories/` as routine server-written churn (`bookkeepingDirs` / `bookkeepingKeepOursPrefixes` in `src/server/integration-orchestrator.ts`, ~line 334; `isNonCodePublishDrift`; the dirty-main guard in docs/close-out-pipeline.md). So every time a reminder is created, snoozed or marked done while a close-out runs, an unrelated landing is blocked and needs a manual "Commit & continue". Scheduled-task definitions (`schedules/`, #0093) are stamped by the server (`last_run_at`, `last_occurrence_key`) and have the same problem.

## Desired UX
A dirty or advancing `reminders/` (and `schedules/`) tree never blocks or restarts a close-out:
- At publish, a dirty file under these dirs is treated as routine server-written churn, auto-checkpointed (committed on main by RepoOS) like dirty `work/` `inputs/` `stories/` files, not as unrelated dirty code.
- A conflict in these dirs resolves to main's copy (`autoResolveOurs`), and main advancing only by commits in these dirs counts as non-code drift (no candidate resync).
- The directory names come from config (`remindersDir`, `schedulesDir`) the same way `workDir`, `inputsDir` and `storiesDir` do, so non-default locations work.
- Real source files that are dirty on main still block, exactly as today (fail closed).

## Acceptance criteria
- Tests: a dirty `reminders/<id>.md` (modified and untracked) on main at publish does not abort the merge and is checkpointed; the same for `schedules/*.md`; a dirty source file still aborts with the existing message.
- Tests: main advancing only by `reminders/` or `schedules/` commits is non-code drift (no resync); a conflict in these dirs keeps main's copy.
- Tests: custom `remindersDir`/`schedulesDir` values are honoured.
- docs/close-out-pipeline.md (the routine-churn paragraph and the autoResolveOurs paragraph) and user-docs/review-and-close-out.md updated.

## Notes for AI
Extend `bookkeepingDirs` and its callers rather than adding a parallel list, and check every place that enumerates the three bookkeeping dirs (grep workDir/inputsDir/storiesDir in src/server and src/core). Keep the allowlist semantic and fail-closed (AGENTS.md "Integration conflicts"). Do not touch repoos.toml. Source: Nick, 2026-10-20 (a landing was blocked by reminders/37fba592-....md).

## Activity

- 2026-10-20T04:20:16Z · created · njachowski@gmail.com
