---
id: "0911"
title: "Easter eggs bundle: dropzone shot evidence (Manual tab, default picker)"
type: feature
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-22T01:34:32Z"
updated_at: "2026-10-22T04:25:31Z"
---
## Items
- [ ] **E1 · Manual-tab handoff capture does not show a dropzone** (web) — #0899's declared Manual-tab shot has a click step but no recorded assertion, so the capture alone does not prove the dropzone rendered. Source: reviewer notes on #0899 (passes 4 and 5), 2026-10-22.
- [ ] **E2 · TaskDrawer handoff shot shows the upload-failure state, not the default picker** (web) — the declared TaskDrawer fixture lands on the failure state; add a shot of the default upload picker beside it. Source: same reviewer notes.
- [ ] **E3 · 'Runner memory pressure' red card has no padding** (web) — in the task drawer Debug tab (#0901's banner) the card's heading ('Runner memory pressure'), the host name (thinkpad) and the body text sit flush against the red border with no inner padding, and the card is not aligned with the other cards' spacing; the Fix line repeats the same text twice. Fix the padding (use the shared card spacing) and show the fix line once. Source: user screenshot, 2026-10-22.
- [ ] **E4 · Settings: put the 'restart required' hint to the left of the control so every input and toggle is flush right** (web) — on Settings rows (for example 'Task browser work' with the 'Runner when available' dropdown) the amber 'restart required' badge sits to the right of the control, which pushes controls out of alignment with rows that have no badge. Move the badge to the left of the control (between the description and the control, or just left of it) so all dropdowns, inputs and toggles share one right edge. Keep the badge's tooltip/ARIA text, and keep it readable on narrow widths. Source: user screenshot, 2026-10-22.

## Problem
#0899 landed the dropzone layout fix, but two pieces of handoff evidence are weaker than they should be: one declared shot has no assertion, and the TaskDrawer shot shows only the failure state.

## Desired UX
Reviewers can see the dropzone rendered on the Manual tab and the default (non-error) picker in the TaskDrawer without extra steps.

## Acceptance criteria
- E1: the Manual-tab shot declares an assert that the dropzone exists, and the capture shows it in light and dark themes.
- E2: a TaskDrawer shot of the default picker is declared next to the failure-state shot, using a state fixture, no placeholder-selector click steps.
- Both pass a handoff capture with zero console errors.

## Notes for AI
See #0899 and its reviews under .repoos/reviews/0899/. Use repoos update --shots to declare shots. Easter-eggs bundle (one open bundle at a time); keep it to these two items.

## Screenshots

![E3: Runner memory pressure red card has no inner padding (Debug tab)](/api/tasks/0911/attachments/att_6deb50f6-503c-49bf-9f05-c276f45e03a6.png)

## Activity

- 2026-10-22T01:34:32Z · created · njachowski@gmail.com
- 2026-10-22T04:13:48Z · body: Items (added 1)
- 2026-10-22T04:13:54Z · screenshots
- 2026-10-22T04:25:26Z · body: Items (added 1)
