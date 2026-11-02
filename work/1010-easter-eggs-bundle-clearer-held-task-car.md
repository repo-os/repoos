---
id: 1010
title: "Easter eggs bundle: clearer held task cards"
type: chore
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-02T04:38:23Z"
updated_at: "2026-11-02T12:44:05Z"
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

## Screenshots

![Held task cards currently repeat the Held state as a chip and lower-left label, while showing a green Restart work button.](/api/tasks/1010/attachments/att_4dfea477-d78d-45e9-93e7-5bb25474a00d.png)

## Notes for AI
Inspect the task card rendering and held-task action handlers. Reuse the existing hold-release API/command semantics rather than introducing a direct status mutation. Keep the release action distinct from a forced restart: clearing the hold should allow RepoOS's ordinary guarded dispatch to decide whether work can resume. The screenshot attachment shows three held cards and the duplicated state text/action.

## Additional task-panel and report layout fixes
\n\n## Requested fixes\n\n- Fix the Hold task modal's broken spacing and padding. Keep the title, explanatory text, reason field, optional release date, and footer buttons inside a consistently padded modal with clear spacing between fields. Use the attached hold-modal screenshot as the visual reference.\n- Move the Hold button in the task panel's bottom action row to the right of Archive task. Preserve the existing Delete task action and ensure the row has consistent spacing. Use the attached task-actions screenshot as reference.\n- In the review tab's engineering report view, place the report-pass table above the report content, near the Report/Chat toggle. It must not end up below the report at the bottom of a long panel. Use the attached report-layout screenshot as reference.\n- Add or update UI coverage for the modal spacing, task action order, and report-table position. Verify responsive layout and preserve keyboard accessibility.

## Activity

- 2026-11-02T04:38:23Z · created · njachowski@gmail.com
- 2026-11-02T04:38:24Z · screenshots
- 2026-11-02T04:38:24Z · needs_input
- 2026-11-02T04:38:38Z · body: Notes for AI (added)
- 2026-11-02T07:14:04Z · needs_input
- 2026-11-02T12:44:05Z · body: Additional task-panel and report layout fixes (added)
