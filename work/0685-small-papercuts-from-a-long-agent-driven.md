---
id: "0685"
title: Small papercuts from a long agent-driven run
type: chore
status: review
priority: p3
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/small-papercuts-from-a-long-agent-driven
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-05T16:58:52Z"
updated_at: "2026-10-05T22:29:15Z"
review_rounds: 1
review_passes: 1
---
## Problem

A list of low-severity items; fix together or split as convenient:
1. Tasks flagged `needs input: underspecified, missing sections: Desired UX` for non-UI tasks and repos that do not use RepoOS's headings; required sections are undocumented. Make "Desired UX" optional for non-UI areas and document the section rules.
2. After Move to done, `queuePosition` showed 4, 5, 6 with only one or two other jobs queued (looks inflated; unverified).
3. After an auto-fix round starts, the previous review text still shows as the current review until a new one lands; mark it superseded.
4. `repoos service list` shows a freshly installed and started service as `disabled ... auto-start no`; clarify enabled vs running vs auto-start.
5. No CLI to delete a task: the UI button calls `DELETE /api/tasks/:id`. Add `repoos rm <id>` (confirmation flag) using the same code path (verified: the API commits the removal).
6. The Agents page Test button: 8 s timeout and truncated 4 KB error (see board-agents task).
7. Document `autoEngineeringMode` plainly: event-driven (task reaches review, dependency merged, startup, config change), respects `dependsOn`, skips needsInput/archived, caps at `maxActiveTasks`, and asks the PM agent (an LLM call, recorded as a dispatch session) which ready tasks to start.
8. Idempotent `/start` on an already-running task correctly answers "already running" (good; keep).

## Acceptance criteria

- Each item fixed or explicitly declined with a reason in the task activity; tests where behaviour changes. `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Activity

- 2026-10-05T16:58:52Z · created · unknown
- 2026-10-05T16:58:53Z · needs_input
- 2026-10-05T17:11:38Z · note: Add two items found in a follow-up audit (2026-10-06): (a) declared shots with an unknown target (e.g. 'default' when the only preview target is 'web') are only reported as a 'shots: skipped' activity note at handoff; validate the target when --shots is written, list valid names, make 'default' resolve to the sole target, and show a visible warning when shots were skipped. (b) The built-in Debugger has its own enable toggle (builtInAgents.debugger.enabled) separate from the 'debugger' agent row; an enabled agent row with the toggle off ran zero sessions silently. Make them one setting or warn in repoos doctor.
- 2026-10-05T17:17:07Z · story
- 2026-10-05T17:17:08Z · body: section Story context
- 2026-10-05T21:20:17Z · status inbox→ready
- 2026-10-05T21:20:19Z · cli_override, model_override
- 2026-10-05T21:20:19Z · status ready→active, needs_input, branch
- 2026-10-05T21:57:23Z · note: Papercuts: (6) Agents Test timeout/diagnostic truncation already fixed on main (#0677, model-test.ts). (8) idempotent /start kept as-is.
- 2026-10-05T22:03:15Z · status active→review
- 2026-10-05T22:03:15Z · note: Task body is underspecified: missing sections: Desired UX
- 2026-10-05T22:04:28Z · status review→active
- 2026-10-05T22:05:32Z · note: Review round 2: audit (a) complete — default→sole target at CLI validate and capture (resolveDeclaredTarget); shot skip warnings unchanged at handoff. Items 6/8 declined per prior note.
- 2026-10-05T22:29:15Z · status active→review
- 2026-10-05T22:29:15Z · note: Task body is underspecified: missing sections: Desired UX
