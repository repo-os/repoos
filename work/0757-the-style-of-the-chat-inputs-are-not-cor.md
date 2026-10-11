---
updated_at: "2026-10-11T14:34:01Z"
review_passes: 1
id: "0757"
title: Unify chat input styling
type: bug
status: review
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/unify-chat-input-styling
created_at: "2026-10-11T14:03:29Z"
---
## Problem
The chat input controls are visually inconsistent across places in the app. Different fields use different wording, styling, and layout treatment, which makes the interface feel mismatched and harder to read. The selected state for text inputs and textareas is not obvious enough, so it is unclear when a field is active. Some inputs also show random helper text beneath them, which adds noise and breaks consistency. The upload control and submit control should match the same visual language instead of feeling like separate widgets.

## Desired UX
All text entry fields should use the same styling and phrasing everywhere, with no mixed wording or special-case treatment. The active/selected state should be visibly brighter and more obvious so users can immediately tell a field is focused or selected. Helper text under the input should be removed; these controls should remain clean and minimal. Screenshot upload controls should match the same visual treatment as the text inputs. The submit button should use a simple square-ish paperplane/airplane icon, kept consistent across all chat surfaces.

## Acceptance criteria
- [ ] All chat-related text inputs and textareas share one consistent visual style and wording pattern.
- [ ] The focused/selected state for text entry controls is clearly brighter and easier to identify.
- [ ] No random or inconsistent helper text appears beneath chat inputs.
- [ ] Screenshot upload controls use the same styling as the rest of the chat entry controls.
- [ ] The submit action uses a simple square-ish paperplane icon consistently across all chat inputs.
- [ ] The interface remains clean, minimal, and visually consistent without introducing new special-case styling.

## Notes for AI
- Keep the fix scoped to chat input and composer UI patterns; do not broaden into unrelated form styling.
- Prefer one shared styling treatment for all text-entry controls rather than adding per-field exceptions.
- Remove any conditional helper copy under inputs instead of trying to standardize it.
- Match the upload control to the same visual language as the text fields and submit area.
- Default assumption: the update applies to the web UI chat/composer surfaces, and the "paperplane" button should be a compact square-ish icon rather than a text label-only action.
- Do not introduce new wording or help text that was not already part of the intended design.

## Scope
- Covers: chat input, textarea, screenshot upload, and submit button styling in the relevant UI surfaces.
- Deferred: broader redesign of unrelated forms or non-chat input controls outside this interaction pattern.

## Related
- This task is specific to the chat/composer UX and should be checked against any existing UI style conventions in the product.

## Original prompt

the style of the chat inputs are not correct, they should all be the same, not using different wording, also the active /selected state of the text input/text area should be brighter so it's more obvious that it's selected. also don't put anything under the text input, some have a random text that shows sometimes, just re-use the same styling for all, and make it obvious and clean, and if there's a screenshot upload use the same style for that too. i think for the submit just go with the simple aeroplane/paperplane icon which is a square-ish icon. it keeps it easy and consistent across all

## Screenshots

![Screenshot-2026-10-10-at-09.28.22](/api/tasks/0757/attachments/screenshot-1.png)
![Screenshot-2026-10-10-at-08.54.58](/api/tasks/0757/attachments/screenshot-2.png)
![Screenshot-2026-10-10-at-08.54.34](/api/tasks/0757/attachments/screenshot-3.png)
![Screenshot-2026-10-10-at-08.54.07](/api/tasks/0757/attachments/screenshot-4.png)
![Screenshot-2026-10-10-at-08.54.23](/api/tasks/0757/attachments/screenshot-5.png)
![Screenshot-2026-10-10-at-09.28.34](/api/tasks/0757/attachments/screenshot-6.png)
![Screenshot-2026-10-10-at-08.53.53](/api/tasks/0757/attachments/screenshot-7.png)
![Screenshot-2026-10-10-at-08.54.46](/api/tasks/0757/attachments/screenshot-8.png)
![Screenshot-2026-10-10-at-04.16.42](/api/tasks/0757/attachments/screenshot-9.png)

## Shots
```json
[
{
"label": "PM chat composer — square paperplane submit and matching upload control",
"target": "default",
"route": "/work?task=0757&tab=pm",
"highlight": ".ai-chat-compose",
"steps": [
{
  "click": ".ai-chat-compose textarea"
},
{
  "waitMs": 300
}
]
},
{
"label": "Dev composer — paperplane submit replaces the old Send text label",
"target": "default",
"route": "/work?task=0757&tab=agent",
"highlight": ".ai-chat-compose"
},
{
"label": "Focused composer — brighter accent ring on the active input",
"target": "default",
"route": "/work?task=0757&tab=pm",
"highlight": ".ai-chat-compose",
"steps": [
{
  "click": ".ai-chat-compose textarea"
},
{
  "waitMs": 400
}
]
}
]
```

## Activity

- 2026-10-11T14:03:29Z · created · hello@repoos.org
- 2026-10-11T14:03:33Z · screenshots
- 2026-10-11T14:03:33Z · screenshots
- 2026-10-11T14:03:34Z · screenshots
- 2026-10-11T14:03:34Z · screenshots
- 2026-10-11T14:03:35Z · screenshots
- 2026-10-11T14:03:35Z · screenshots
- 2026-10-11T14:03:36Z · screenshots
- 2026-10-11T14:03:36Z · screenshots
- 2026-10-11T14:03:37Z · screenshots
- 2026-10-11T14:04:00Z · status draft→inbox, title, area, type, body
- 2026-10-11T14:07:20Z · status inbox→ready
- 2026-10-11T14:07:22Z · status ready→active, branch
- 2026-10-11T14:23:12Z · body
- 2026-10-11T14:24:20Z · body
- 2026-10-11T14:25:51Z · body: section Shots
- 2026-10-11T14:33:10Z · status active→review
- 2026-10-11T14:34:01Z · note: review pass 1: needs some work

