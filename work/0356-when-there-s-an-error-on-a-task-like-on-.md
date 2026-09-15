---
updated_at: "2026-09-15T14:28:16Z"
review_passes: 1
id: "0356"
title: "Route task error \"Fix\" action to that task's own debugger"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/route-task-error-fix-action-to-that-task
model_override: openrouter/deepseek/deepseek-v4.1-flash
review_model_override: opencode-go/hy3
created_at: "2026-09-15T14:19:42Z"
---
## Problem

When an error appears on a task (for example in the Move to Done / MTD flow), the **Fix** action opens the *global* debugger. That behavior predates per-task debug tabs. Now that every task has its own debugger in its Debug tab, routing Fix to the global debugger loses the failing task's context and forces the user back to a generic, unscoped debugger.

## Desired UX

Clicking **Fix** on a task error opens the debugger that belongs to *that task* — the debugger in the task's Debug tab — rather than the global debugger. The user lands on a debugger already scoped to the task that produced the error. The global debugger keeps its existing entry point and is untouched.

## Acceptance criteria

- [ ] Clicking **Fix** on a task error opens the per-task debugger in that task's Debug tab, not the global debugger.
- [ ] The per-task debugger is scoped to the task that raised the error (the failing task's context, not a blank/global session).
- [ ] The Move to Done (MTD) error case described in the original prompt now fixes into the task's own debugger.
- [ ] The global debugger remains reachable through its existing entry point, with unchanged behavior.
- [ ] Task error display and the existing Fix affordance are otherwise unchanged.

## Notes for AI

- This is a re-pointing of an existing action, not new debugging functionality. Keep the change minimal.
- Assumption: "MTD" means the Move to Done flow; treat the cited case as representative of any task-level error that exposes the Fix action. Verify whether other task-error surfaces share the same wiring and fix them consistently if so.
- Assumption: the per-task debugger lives behind the task's Debug tab (per the prompt). Route Fix to open that tab's debugger for the task in question.
- Files to touch are UI-side: `src/ui-app/src/router.ts` (routes), the relevant task view/error component, and `src/ui-app/src/nav.ts`/`style.css` if the Fix affordance or tab handling lives there. Grep the UI for the current global-debugger routing before changing it.
- Do NOT remove or alter the global debugger; only stop task-level Fix from targeting it.
- Rebuild the UI after the change (`bun run build:ui` for speed, or `bun run build`).
- Do NOT auto-request a preview; previews are on the human's request.

## Scope

Covers: re-pointing the task error **Fix** action from the global debugger to the failing task's per-task debugger.

Deferred: any new debugging capabilities, changes to how per-task or global debuggers themselves work, and any redesign of the task error UI.

## Original prompt

when there's an error on a task, like on this MTD, if I click fix it should send it to the debugger in this task, not the global debugger (that was before we had a debugger in each task debug tab)

## Screenshots

![Screenshot-2026-09-15-at-22.18.17](/api/tasks/0356/attachments/screenshot-1.png)

## Activity

- 2026-09-15T14:19:42Z · created · hello@repoos.org
- 2026-09-15T14:19:43Z · screenshots
- 2026-09-15T14:19:58Z · status draft→inbox, title, area, type, body
- 2026-09-15T14:20:57Z · model_override
- 2026-09-15T14:21:02Z · review_model_override
- 2026-09-15T14:21:02Z · status inbox→ready
- 2026-09-15T14:21:09Z · status ready→active, branch
- 2026-09-15T14:27:36Z · status active→review

