---
id: "0647"
title: Add diff button for dirty changed files in task panel
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-diff-button-for-dirty-changed-files-
cli_override: opencode
created_at: "2026-10-04T11:35:24Z"
updated_at: "2026-10-04T11:54:26Z"
---
## Problem
When a branch has changed/dirty files, there's no quick way to see that diff from the task panel. The full-screen diff functionality already exists in the changes tab of the task panel, but it isn't reused here.

## Desired UX
When there are dirty changed files on the branch, show a diff button in the relevant panel area. Clicking it should open the same full-screen diff view used by the changes tab of the task panel.

## Acceptance criteria
- [ ] Show a diff button when the branch has dirty/changed files
- [ ] Clicking the button opens the full-screen diff view already built for the task panel's changes tab
- [ ] Reuse the existing diff component/functionality rather than building a new one

## Notes for AI
- Reuse the full-screen diff functionality from the task panel's changes tab.
- Only show the button when files are actually dirty/changed.
- Don't invent new diff logic; hook into what's already there.
- Assumed "here" refers to the task panel area where dirty state is visible; if the exact placement is ambiguous, place it near the changed-files indicator.

## Scope
In scope: adding the conditional diff button and wiring it to the existing full-screen diff. Out of scope: any new diff rendering logic, changes to the changes tab itself, or handling uncommitted vs. unstaged distinctions beyond what's already exposed.

## Related
Changes tab of the task panel (existing diff feature)

## Original prompt

When there are changed files making the branch dirty let's add a diff button here if possible, re-using the same full-screen diff functionality we built for the changes tab of the task panel.

## Screenshots

![Screenshot-2026-10-04-at-19.14.48](/api/tasks/0647/attachments/screenshot-1.png)

## Shots
```json
[
  {
    "label": "Changes tab - code-changes summary; the dirty-worktree View diff button sits directly under these stats while files are uncommitted",
    "target": "default",
    "route": "/work?task=0647",
    "highlight": ".changes-summary[aria-label=\"Code changes summary\"]",
    "steps": [
      {
        "click": "[data-test-id=task-tab-changes]"
      },
      {
        "waitMs": 600
      }
    ]
  }
]
```

## Activity

- 2026-10-04T11:35:24Z · created · hello@repoos.org
- 2026-10-04T11:35:25Z · screenshots
- 2026-10-04T11:36:00Z · status draft→inbox, title, area, body
- 2026-10-04T11:37:08Z · cli_override, model_override
- 2026-10-04T11:37:26Z · model_override
- 2026-10-04T11:37:29Z · status inbox→ready
- 2026-10-04T11:39:04Z · status ready→active, branch
- 2026-10-04T11:46:46Z · body: section Shots
- 2026-10-04T11:54:26Z · status active→review
