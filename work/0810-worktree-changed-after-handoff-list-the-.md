---
id: "0810"
title: "Worktree changed after handoff: list the changed files with +/- lines in the modal (scrollable, max 60% height)"
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/worktree-changed-after-handoff-list-the-
created_at: "2026-10-16T12:17:43Z"
updated_at: "2026-10-16T15:51:50Z"
---
## Problem
When a task's worktree changes after handoff, the 'Worktree changed after handoff' modal says what the HEAD moved from and to, but not which files changed. The user has to guess what they're discarding, or open a terminal to check. Example: #0807 was blocked by a repoos.toml commit and two task-file updates, and the modal did not say so.

## Desired UX
- The modal lists every file changed since the handoff, with added and removed line counts (+N / -M) for each file.
- Files are grouped simply: the changed files first, then any task files, so bookkeeping is easy to spot.
- If the list is long, the modal does not grow past 60% of the window height. The file list scrolls inside the modal; the buttons (Cancel, Send back to engineer, Discard post-handoff edits) stay visible without scrolling.
- The explanation text and the three buttons stay as they are.

## Acceptance criteria
- Test: a modal with 3 changed files shows each file with its +N / -M counts.
- Test: a modal with 60 changed files keeps its height at or below 60% of the window height and scrolls the file list, with the buttons still visible.
- Test: when the diff cannot be computed, the modal still shows the reason and the three buttons, with a note that the file list is unavailable.
- Light and dark themes checked; keyboard scrolls the list.

## Notes for AI
Start from the worktree-changed-after-handoff modal in src/ui-app (grep for 'Worktree changed after handoff' and 'Discard post-handoff edits'). Build the file list from git diff --numstat between the handoff commit and HEAD on the server side. Use the shared dialog components and the existing modal styles (AGENTS.md). Source: user request 2026-10-16 after #0807.

## Activity

- 2026-10-16T12:17:43Z · created · njachowski@gmail.com
- 2026-10-16T12:23:51Z · status inbox→ready
- 2026-10-16T12:23:53Z · status ready→active, branch
- 2026-10-16T15:45:06Z · status active→review
- 2026-10-16T15:45:06Z · note: handoff requested (cli)
- 2026-10-16T15:45:09Z · handoff failed · task-file handoff failed at commit · task #0810 has no registered worktree for branch feat/worktree-changed-after-handoff-list-the-
- 2026-10-16T15:51:50Z · watchdog: auto-surfaced stuck task · status active→ready · agent crashed or was interrupted mid-turn — task-file handoff failed at commit · task #0810 has no registered worktree for branch feat/worktree-changed-after-handoff-list-the- · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
