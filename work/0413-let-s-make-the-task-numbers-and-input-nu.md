---
id: "0413"
title: Make task and input numbers visible and copyable
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/make-task-and-input-numbers-visible-and-
created_at: "2026-09-18T12:59:44Z"
updated_at: "2026-09-18T14:04:21Z"
review_passes: 1
---
## Problem

Task and input numbers are currently difficult to see. Input numbers also include the word “Input,” unlike task numbers, making the presentation inconsistent. Users need a quick way to copy a direct link to a specific task or input.

## Desired UX

Task and input numbers should be visually prominent and easy to identify. Input numbers should use the same concise format as task numbers, showing only the number rather than the “Input” label.

Clicking a task number or input number should copy its deeplink to the clipboard and show a toast or other clear indication that the link was copied successfully.

## Acceptance criteria

- [ ] Task numbers are more visually visible than they are currently.
- [ ] Input numbers are more visually visible than they are currently.
- [ ] Input numbers display only the number, using the same presentation convention as task numbers rather than showing “Input #0001.”
- [ ] Clicking a task number copies the deeplink for that task to the clipboard.
- [ ] Clicking an input number copies the deeplink for that input to the clipboard.
- [ ] A toast or other clear UI indication appears after a task or input deeplink is copied.
- [ ] Task and input number interactions do not navigate away from the current view unless that is already part of the existing behavior.

## Notes for AI

- Keep the task-number and input-number presentation consistent with each other.
- Preserve the existing deeplink destinations; this task changes their visibility and copy interaction, not the link targets.
- Assume the copy indication should be shown for both successful task-link and input-link copy actions.
- Do not add unrelated changes to task or input behavior.

## Scope

This task covers the web UI presentation and click-to-copy behavior for task and input numbers. Changes to deeplink URL structure or unrelated clipboard interactions are deferred.

## Original prompt

let's make the task numbers and input numbers more visible, now they're hard to see. also if the user clicks on the task number or input number it should copy the deeplink to it and show a toast or indication that it was copied to clipboard. also on the input number don't say the actual work "Input #0001" just put the number...same as we do on task #s.

## Activity

- 2026-09-18T12:59:44Z · created · hello@repoos.org
- 2026-09-18T13:00:00Z · status draft→inbox, title, area, body
- 2026-09-18T13:00:39Z · status inbox→ready
- 2026-09-18T13:00:41Z · status ready→active, branch
- 2026-09-18T13:08:41Z · status active→review
- 2026-09-18T14:04:21Z · status review→done, release:success
