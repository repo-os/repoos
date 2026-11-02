---
id: 1010
title: "Easter eggs bundle: clearer held task cards"
type: chore
status: done
priority: p3
area: web
merged_commit: 9b9b13a52a04b7a888cfe48642fd0acc8644b0e1
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-clearer-held-task-car
model_override: gpt-6.1-terra
created_at: "2026-11-02T04:38:23Z"
updated_at: "2026-11-02T14:06:03Z"
last_close_out_gate_ms: 619265
last_close_out_gate_at: "2026-11-02T14:03:00.889Z"
review_passes: 1
last_check_failure: "repoos check at 2026-11-02T13:18:45.518Z: repoos check failed: rendered-contrast — timed out — timed out after 600s"
---
## Problem
Held task cards show a yellow Held chip and repeat “HELD” at the lower left. Their green “Restart work” button is also misleading: a held task is intentionally inert and should not look like ordinary restartable work.

## Desired UX
Keep the yellow Held chip as the state indicator and remove the redundant lower-left “HELD” label. Replace the green “Restart work” action with an amber “Release hold” button. The action should clearly communicate that it clears the hold; any subsequent start must follow RepoOS's normal pressure guard, task selection, and capacity rules. Non-held cards keep their existing actions and styling.

## Acceptance criteria
- Held cards retain the yellow Held chip and no longer render the duplicate lower-left label.
- Held cards show an amber “Release hold” action instead of the green “Restart work” action.
- Activating “Release hold” clears the hold through the supported RepoOS flow and does not bypass pressure guard or active-task limits.
- Non-held card actions and status presentation remain unchanged.
- Add UI coverage for the held and non-held card states and the release action.
- Include/update a declared preview shot for the held card state so review can inspect the result.

## Notes for AI
Inspect the task card rendering and held-task action handlers. Reuse the existing hold-release API/command semantics rather than introducing a direct status mutation. Keep the release action distinct from a forced restart: clearing the hold should allow RepoOS's ordinary guarded dispatch to decide whether work can resume. The screenshot attachment shows three held cards and the duplicated state text/action.

## Additional task-panel and report layout fixes
## Requested fixes

- Fix the Hold task modal's broken spacing and padding. Keep the title, explanatory text, reason field, optional release date, and footer buttons inside a consistently padded modal with clear spacing between fields. Use the attached hold-modal screenshot as the visual reference.
- Move the Hold button in the task panel's bottom action row to the right of Archive task. Preserve the existing Delete task action and ensure the row has consistent spacing. Use the attached task-actions screenshot as reference.
- In the review tab's engineering report view, place the report-pass table above the report content, near the Report/Chat toggle. It must not end up below the report at the bottom of a long panel. Use the attached report-layout screenshot as reference.
- Add or update UI coverage for the modal spacing, task action order, and report-table position. Verify responsive layout and preserve keyboard accessibility.

## Shots
```json
[
{
"label": "Held task card with release action",
"target": "default",
"route": "/work",
"highlight": ".tc-held",
"state": "card:held"
}
]
```

## Screenshots

![Held task cards currently repeat the Held state as a chip and lower-left label, while showing a green Restart work button.](/api/tasks/1010/attachments/att_4dfea477-d78d-45e9-93e7-5bb25474a00d.png)
![Hold task modal spacing and padding](/api/tasks/1010/attachments/att_f9cd64ed-fd6d-4669-b0af-056a5cd1e5c8.png)
![Engineering report pass table should appear before the report](/api/tasks/1010/attachments/att_fd7d1451-7bb1-4d1f-861e-b1b407c077c3.png)
![Hold action should follow Archive task in the task panel](/api/tasks/1010/attachments/att_c755ebbc-74fa-4bcc-abba-0323b8588403.png)

## Activity

- 2026-11-02T04:38:23Z · created · njachowski@gmail.com
- 2026-11-02T04:38:24Z · screenshots
- 2026-11-02T04:38:24Z · needs_input
- 2026-11-02T04:38:38Z · body: Notes for AI (added)
- 2026-11-02T07:14:04Z · needs_input
- 2026-11-02T12:44:05Z · body: Additional task-panel and report layout fixes (added)
- 2026-11-02T12:44:05Z · screenshots
- 2026-11-02T12:44:24Z · body: Additional task-panel and report layout fixes (removed 1); Requested fixes (added)
- 2026-11-02T12:46:31Z · model_override
- 2026-11-02T12:46:35Z · status inbox→ready
- 2026-11-02T12:46:41Z · status ready→active, branch
- 2026-11-02T12:48:23Z · body
- 2026-11-02T12:55:46Z · message_queued at 2026-11-02T12:55:46.740Z
- 2026-11-02T12:55:46Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-02T12:55:54Z · body
- 2026-11-02T12:58:05Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-02T12:58:06Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-02T12:58:06Z · message_delivered: 1 message(s)
- 2026-11-02T13:25:37Z · body
- 2026-11-02T13:49:12Z · status active→review
- 2026-11-02T13:51:45Z · note: review pass 1: good to go
- 2026-11-02T14:03:00Z · close-out gate completed in 619s
- 2026-11-02T14:06:03Z · status done→done, release:success
