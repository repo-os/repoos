---
id: "0656"
title: Validate priority and type on task create/update (reject values outside p0-p3 and the known types)
type: chore
status: active
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/validate-priority-and-type-on-task-creat
created_at: "2026-10-05T03:23:28Z"
updated_at: "2026-10-05T06:11:05Z"
last_check_failure: "repoos check at 2026-10-05T06:10:21.882Z: server-side finalization timed out (deadline exceeded)"
---
## Problem
Nothing validates a task's priority or type, so invalid values land in work/*.md. src/core/task.ts reads priority as String(data.priority ?? "p2") and accepts anything; the CLI (src/commands/tasks.ts, repoos new / update) and the API routes (src/server/routes/tasks.ts) pass --priority / --type straight through. user-docs/cli.md lists p0,p1,p2,p3 for --priority, but the usage text only shows 'repoos new ... --priority p1' and 'repoos update ... --priority p', so the valid set is not obvious at the point of use. On 2026-10-05 an agent created five tasks with --priority medium (and one with --type improvement); four were corrected by hand afterwards. A survey of work/*.md today shows existing invalid values: priority high x2, p4 x1, medium x1; type ux x2, perf x2, documentation x2, task x1, fix x1, feat x1, docs x1. The constants already exist: PRIORITIES and TASK_TYPES in src/core/types.ts.

## Desired UX
repoos new / repoos update and the matching API routes reject an invalid --priority or --type with a one-line error that names the field, the bad value and the full list of valid values (for example: priority 'medium' is not valid; use one of p0, p1, p2, p3). Nothing is silently coerced (no medium -> p2), because a silent default hides the mistake. Usage text for both commands lists the valid values instead of 'p' / a single example.

## Acceptance criteria
- Create and update (CLI and HTTP) fail with a clear message for a priority outside PRIORITIES or a type outside TASK_TYPES; the task file is not written or changed.
- The parser keeps reading existing files with legacy/invalid values without crashing (AGENTS.md: changing the task format is self-modifying for this repo; verify the parser still reads every file in work/). Decide and document what a legacy invalid value does on READ (preserve as-is and show as an unknown, or normalise with a one-time migration like the area migration in #0583) and, if migrating, write the migration in the same change.
- Areas, depends-on and other fields keep their current behaviour; this task covers priority and type only.
- Tests: valid values pass; each invalid value is rejected on new and on update via CLI and API; legacy files still parse; usage text lists the valid values.
- user-docs/cli.md and the usage strings are updated to match; the UI create/edit controls already offer fixed choices, confirm they cannot send an invalid value.

## Notes for AI
Affected files found by survey: priority high, p4 and medium; type ux, perf, documentation, task, fix, feat, docs (re-run grep -h '^priority:' work/*.md | sort | uniq -c and the same for type to get the current list). Do not rewrite task files by hand; use repoos commands or the API per AGENTS.md.

## Activity

- 2026-10-05T03:23:28Z · created · unknown
- 2026-10-05T05:18:05Z · status inbox→ready
- 2026-10-05T05:18:05Z · status ready→active, branch
- 2026-10-05T06:11:05Z · status active→review
- 2026-10-05T06:11:05Z · status review→active
