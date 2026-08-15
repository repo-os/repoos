---
id: "0204"
title: Show dirty main files on move-to-done and offer to auto-commit
type: feature
status: review
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/show-dirty-main-files-on-move-to-done-an
created_at: "2026-08-15T02:15:27Z"
updated_at: "2026-08-15T02:51:18Z"
---
## Activity

- 2026-08-15T02:15:27Z · created · unknown


## Problem

When a user clicks "move to done" in the UI, the close-out flow can fail silently or with a confusing server-side error if `main` has dirty or uncommitted files. The most common case is `dist/.build-info.json` being dirty from a local build. The user has no visibility into what's blocking the close-out and no way to fix it from the UI.

## Desired UX

When the user clicks "move to done," the server first checks if `main` has any dirty/uncommitted files. If it does, instead of proceeding into the close-out flow:

1. Show a modal/popup listing every dirty file on `main`
2. Offer two buttons: **"Commit & continue"** and **"Cancel"**
3. If the user clicks "Commit & continue," the server auto-commits the dirty files with a message like `chore: checkpoint before close-out (#{taskId})`, then proceeds with the normal close-out flow
4. If the user clicks "Cancel," the close-out is aborted and the task stays in review

This keeps the close-out flow from hitting merge failures due to dirty main, while giving the user full control over what gets committed.

## Acceptance criteria

- [ ] Server exposes an endpoint to check dirty files on `main` (or the close-out endpoint checks first)
- [ ] UI shows a confirmation modal listing dirty files when "move to done" is clicked
- [ ] Modal has "Commit & continue" and "Cancel" buttons
- [ ] "Commit & continue" auto-commits dirty files and proceeds with close-out
- [ ] "Cancel" aborts and task stays in review
- [ ] If no dirty files exist, close-out proceeds as normal with no modal
- [ ] The repository lock (`src/server/repo-lock.ts`) uses `require("fs")` in an ESM context which silently fails, so the stale-lock 60-second expiry never works — fix this to use proper ESM imports so stale locks auto-expire
- [ ] Move-to-done checks for a stale lock before enqueueing and offers to clear it

## Notes for AI

- The check is against the main checkout (`config.root`), not the worktree
- Server-side: check before enqueueing the integration job
- Use `git status --porcelain` on main to detect dirty files
- The auto-commit message should reference the task ID for traceability
- `repo-lock.ts` line 34 and 60: `require("fs")` should be replaced with the ESM imports already at the top of the file

## Activity

- 2026-08-15T02:18:26Z · status inbox→ready
- 2026-08-15T02:18:35Z · status ready→active, branch
- 2026-08-15T02:51:18Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
