---
id: "0427"
title: Show full file content in fullscreen diff viewer
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/show-full-file-content-in-fullscreen-dif
review_model_override: opencode-go/mimo-v2.5
created_at: "2026-09-18T18:04:16Z"
updated_at: "2026-09-19T01:10:26Z"
---
## Problem

The fullscreen diff modal (task #0417) only shows lines present in the unified diff patch — changed lines plus ~3 lines of context around each hunk. The rest of the file is missing, shown as '… N lines' separators. To see the whole file the user has to open it in an external editor.

## Desired UX

In the fullscreen diff viewer, both the Before and After panes show the complete file, not just the changed regions. Unchanged sections between hunks are fully visible and scrollable. The diff highlighting (red/green backgrounds) still marks which lines changed.

## Approach

Add a server endpoint (e.g. `GET /api/tasks/:id/file?path=<filepath>&version=before|after`) that reads the raw file content from the task's worktree:
- `version=before`: file content from `main` (git show main:<path>)
- `version=after`: file content from the task branch HEAD

The frontend fetches both versions when the fullscreen modal opens and merges them with the parsed diff to produce the full side-by-side view. Diff positions from the `@@` hunk headers give the line mapping.

## Acceptance criteria

- [ ] New API endpoint returns raw file content for a given task, path, and version
- [ ] Fullscreen diff viewer shows the complete before/after file (not just hunks)
- [ ] Changed lines are still highlighted red/green
- [ ] Unchanged lines render with normal styling
- [ ] Large files load without blocking the UI (stream or paginate if needed)
- [ ] Works for new files (before = empty) and deleted files (after = empty)

## Activity

- 2026-09-18T18:04:16Z · created · unknown
- 2026-09-19T01:03:46Z · review_model_override
- 2026-09-19T01:03:50Z · status inbox→ready
- 2026-09-19T01:03:52Z · status ready→active, branch
- 2026-09-19T01:10:26Z · status active→review
