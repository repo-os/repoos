---
id: "0417"
title: Add fullscreen diff modal in changes tab
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-fullscreen-diff-modal-in-changes-tab
created_at: "2026-09-18T14:45:38Z"
updated_at: "2026-09-18T15:35:12Z"
---
## Problem

The changes tab displays files in a constrained list view, making it difficult to review large or complex diffs. Users need a way to focus on individual file diffs in an expanded view without navigating away from the task panel.

## Desired UX

In the changes tab of the task panel, each file name row has an expand button or icon (positioned on the right side). Clicking it opens a fullscreen modal that:
- Displays the side-by-side diff for that single file
- Covers the entire window
- Has a close (×) button in the top right corner
- Returns to the changes tab list when closed

Only one file's diff is shown at a time; opening another file's diff replaces the current one.

## Acceptance criteria

- [ ] Expand button/icon appears on the right side of each file name in the changes tab
- [ ] Clicking expand opens a fullscreen modal overlay
- [ ] Modal displays the side-by-side diff for the selected file
- [ ] Modal has a close button (×) in the top right corner
- [ ] Closing the modal returns focus to the changes tab list
- [ ] Selecting a different file replaces the modal content (or closes and reopens)
- [ ] Modal is styled consistently with the rest of the RepoOS UI
- [ ] `repoos check` passes

## Notes for AI

- This is a Vue SFC component enhancement in `src/ui-app/src/views/`
- The expand icon should be a standard "fullscreen" or "expand" icon (consider the icon set already in use)
- The modal should support the Escape key for closing in addition to the × button (standard UX)
- Reuse existing diff rendering logic/components where possible
- The modal should handle edge cases: empty diffs, very large diffs, binary files
- Do not modify the default changes tab view beyond adding the button

## Scope

**In scope:** Fullscreen modal UI, expand button, basic side-by-side diff rendering in modal context.

**Deferred:** Diff syntax highlighting improvements, diff comparison options (ignore whitespace, etc.), or other enhancements to the diff viewer itself beyond what already exists.

## Original prompt

In the changes tab for each file I'd like to have a way to expand to see it full screen side-by-side diff (one file at a time). this could be an expand button or icon on the right hand side of the file name (see screenshot of the file names list that I mean in the changes tab of the task panel). And again this new expanded diff view should cover the whole window, like a fullscreen modal with an [x] close button in the top right corner.

## Screenshots

![Screenshot-2026-09-18-at-22.34.25](/api/tasks/0417/attachments/screenshot-1.png)

## Activity

- 2026-09-18T14:45:38Z · created · hello@repoos.org
- 2026-09-18T14:45:38Z · screenshots
- 2026-09-18T14:45:54Z · note: Freeform PM run failed: the PM agent returned unusable output
- 2026-09-18T15:19:15Z · title, area, body
- 2026-09-18T15:19:16Z · status draft→inbox
- 2026-09-18T15:19:16Z · note: Spec applied from the original PM run's output (the run was wrongly rejected because the model wrapped it in a code block; parser fixed on main)
- 2026-09-18T15:35:00Z · status inbox→ready
- 2026-09-18T15:35:12Z · status ready→active, branch
