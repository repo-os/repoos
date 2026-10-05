---
id: "0657"
title: "Archive task: park a task without changing its status, keep its worktree, and restore it later"
type: feature
status: review
priority: p2
area: [web, core]
assigned_to: ai
created_by: ""
branch: feat/archive-task-park-a-task-without-changin
created_at: "2026-10-05T04:14:23Z"
updated_at: "2026-10-05T06:34:40Z"
review_rounds: 2
review_passes: 2
---
## Problem
There is no way to shelve a task that is not worth finishing right now. A task in review that has exhausted its review rounds (for example #0652) stays in the Review column with a 'Waiting for you' card, and the only exits are Move to done (merges the code), Send to engineer, Dismiss, abandon back to ready, or Delete (destroys it). Nothing says 'set this aside, keep the work, I may come back'. The board fills with tasks nobody intends to move.

## Desired UX
- **Archive button.** At the bottom of the task panel, to the right of the Delete task button, add an 'Archive task' button.
- **Confirm modal.** Clicking it opens a confirmation modal (shared dialog components, ui/dialog/*, per AGENTS.md; no native confirm/alert) with an optional free-text field 'Why are you archiving this task?'. Confirming archives; cancelling does nothing.
- **Task file.** Archiving writes two frontmatter fields: `is_archived: true` and `archive_detail: <text>` (the text field is omitted or empty when no reason was given). Add both to the frontmatter key list/normaliser in src/core/task.ts and to the Task type in src/core/types.ts. Writes go through repoos commands / the API only, never by hand-editing work/*.md.
- **Status is untouched.** Archiving does NOT change `status`. A task archived from review stays status: review underneath; unarchiving restores it to exactly that column.
- **Worktree and branch are kept.** Archiving never deletes or resets the branch or worktree. Unarchiving returns the task to wherever it left off with the worktree intact.
- **Work queue page.** Archived tasks are removed from the normal board columns and shown in a collapsible 'Archived' list at the bottom-left of the work queue page, below the Drafts list. It is minimised by default and shows a count of archived tasks (for example 'Archived (4)'); clicking it expands the list. Each row opens the task panel as usual.
- **Archived task panel.** When a task is archived, the top area of the panel shows (a) a big, obvious 'Unarchive' button in place of the Move to done / Stop work / status controls that do not apply while archived, and (b) if archive_detail was given, a prominent card at the top styled like the existing 'Waiting for you' card (see TaskDrawer.vue), showing the reason. Controls that mutate the task's lifecycle (start, send to engineer, move to done, status dropdown, preview) are hidden or disabled while archived; read-only tabs (Task, Review, Changes, Tokens, Debug) still work. Delete stays available.
- **Unarchive.** Clears is_archived and archive_detail and puts the task back in its status column. No other side effects.

## Acceptance criteria
- New endpoints or PATCH fields (decide which; follow the repo's pattern for actions with side effects) to archive with an optional detail and to unarchive; both validate that the task exists and record an Activity line (for example 'archived: <detail>' / 'unarchived').
- Archive is refused (clear message, nothing written) while the task has a live agent run, an in-progress review, a running preview or a running close-out job; the user must stop work first. Document why: a half-stopped run would be orphaned. Unarchive of a task whose branch or worktree has since been removed warns and still restores the status.
- Everything that scans for work ignores archived tasks: auto-engineering dispatch (src/server/auto-engineering.ts), the task watchdog (src/server/task-watchdog.ts), the CTO monitor digest (src/server/cto-monitor.ts), the stuck/idle nudges, board counts and column counters, and 'ready' pickup. An archived task in review must not be re-reviewed or surfaced as stuck. Cover each with a test.
- Dependencies: an archived task that another task depends_on does not count as done; the dependent stays blocked and shows why. Decide how that is worded and document it.
- Archive survives a server restart and index rebuild; the LiveIndex and the SSE task events carry the fields so open clients update without a refresh.
- UI: confirm modal, archived list with count and expand/collapse (remember the expanded state like other board preferences if the repo already does), archived panel header, hidden lifecycle controls. Dialog and the list use the shared components and global form classes; any fixed overlay is teleported and carries data-overlay-layer per AGENTS.md. No bare <select>.
- Migration/compat: existing task files without the fields parse as not archived; the parser round-trips both fields. Verify the parser still reads every existing work/*.md.
- repoos list and the CLI show archived tasks distinctly (or hide them by default with a flag to include them). Decide and document. repoos mv keeps working on archived tasks only if it cannot be used to unarchive implicitly; otherwise refuse with a message pointing at unarchive.
- Docs: user-docs (concepts and task panel/workflow docs) gain an Archive section; AGENTS.md is updated only where this contradicts it.
- Tests: archive/unarchive round trip preserves status and branch; worktree is not touched; frontmatter fields written and parsed; archived tasks excluded from dispatch/watchdog/CTO; refusal while a run is live; UI tests for the modal, list count, panel state.

## Notes for AI
Motivation: #0652 sat in review with needs_input 'review-rounds-exhausted' and no way to shelve it. Relevant code: TaskDrawer.vue (Delete task button, 'Waiting for you' card), DeleteTaskDialog.vue (model for the confirm modal), WorkView.vue (draft column rendering and the board columns), src/server/task-transitions.ts (existing abandon/reopen actions; archive is deliberately NOT a status transition), src/core/task.ts (frontmatter key list). Keep this orthogonal to status: do not add an 'archived' status. Out of scope: bulk archive, auto-archive rules, deleting worktrees of old archived tasks (a later GC task can do that).

## Shots
```json
[
  {
    "label": "Archive task confirm modal (optional reason field)",
    "target": "default",
    "route": "/work",
    "highlight": ".archive-confirm-modal",
    "steps": [
      {
        "click": ".task-card"
      },
      {
        "waitMs": 500
      },
      {
        "click": "[data-test-id=\"archive-task\"]"
      },
      {
        "waitFor": ".archive-confirm-modal"
      },
      {
        "waitMs": 300
      }
    ]
  }
]
```

## Activity

- 2026-10-05T04:14:23Z · created · unknown
- 2026-10-05T04:45:44Z · status inbox→ready
- 2026-10-05T04:45:58Z · status ready→active, branch
- 2026-10-05T05:07:42Z · body: section Shots
- 2026-10-05T05:27:29Z · status active→review
- 2026-10-05T05:27:43Z · note: shots: failed — capture of Archive task confirm modal (optional reason field) on "default" failed: click: Error: strict mode violation: locator('.task-card') resolved to 609 elements:
- 2026-10-05T05:28:40Z · status review→active
- 2026-10-05T06:16:39Z · status active→review
- 2026-10-05T06:16:52Z · note: shots: failed — capture of Archive task confirm modal (optional reason field) on "default" failed: click: Error: strict mode violation: locator('.task-card') resolved to 609 elements:
- 2026-10-05T06:17:56Z · status review→active
- 2026-10-05T06:34:27Z · status active→review
- 2026-10-05T06:34:40Z · note: shots: failed — capture of Archive task confirm modal (optional reason field) on "default" failed: click: Error: strict mode violation: locator('.task-card') resolved to 609 elements:
