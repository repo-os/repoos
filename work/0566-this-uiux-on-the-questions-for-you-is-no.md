---
id: "0566"
title: Fix Questions-for-You duplication and answer UX
type: feature
status: inbox
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: ""
pm_model_override: opencode/muse-spark-1.3-contributor-free
review_cli_override: github copilot
review_model_override: default
created_at: "2026-09-28T04:34:57Z"
updated_at: "2026-09-28T04:36:20Z"
---
## Problem

The "questions for you" prompt currently shows up twice on the task panel, which is confusing and looks like a rendering duplication bug.

It is also visually indistinguishable from other kinds of warnings, so it is not obvious that it is a question the user needs to answer.

Clicking either instance (top and bottom versions) just pastes a bunch of text into the PM chat input, which is not intuitive. Pasting the question into the chat for the user does not make sense — the user does not know what to do with it, and it is unclear what the PM agent thinks is being answered.

## Desired UX

There should be exactly one "questions for you" entry on the task panel.

It should be visually different from other warning types — obvious green/blue styling that immediately reads as "question the user needs to answer".

Clicking it should take the user to the PM chat tab (that navigation part is good and should stay), but instead of pasting the question text into the chat input, the open questions should be displayed above the text input the user types into, again as an obvious blue card, so the user knows exactly what question to answer and the PM agent knows what questions the user is answering in the message.

An acceptable alternative, if the inline card above the input proves too complex, is a new kind of modal showing the "questions for you" with a text area for the user to type their answers, which then sends the answers to the PM agent in the PM tab.

## Acceptance criteria

- [ ] "Questions for you" appears only once on the task panel
- [ ] The prompt is visually distinct from other warning types, using obvious green/blue question styling
- [ ] Clicking the prompt navigates to the PM chat tab
- [ ] Clicking does not paste raw question text into the chat input
- [ ] Open questions are visible in the PM chat context when answering, either as an obvious blue card above the text input or in a dedicated answer modal
- [ ] The user's submitted answer is delivered to the PM agent with the corresponding question context attached

## Notes for AI

- Assumption: implement the preferred inline approach (blue card with open questions above the PM chat text input) unless it proves disproportionately complex, in which case the modal-with-textarea alternative is acceptable.
- Keep the existing behavior of routing the user to the PM chat tab on click; only change what happens once they get there.
- Do not reintroduce the paste-question-text-into-input behavior.
- Avoid touching unrelated warning types beyond ensuring the question card is visually distinct from them.

## Scope

Covers: deduplication of the task-panel prompt, distinct question styling, and the PM-tab answering flow (inline card preferred, modal fallback).

Deferred: changes to how questions are generated or to any other warning/prompt types.

## Original prompt

This uiux on the "questions for you" is not great because it shows up twice on the task panel, it should just be once and visually different from other kinds of warnings (let's go with green/blue and very obvious that it's question the user needs to answer). and when I clicked both of the buttons (top and bottom versions) they both just pasted a bunch of text into the PM chat, which was not intuitive...I think going to the PM chat tab is a good idea, easy, but rather than pasting the question into the chat for you (which doesn't make much sense, probably you should just see the questions there above the text input the user will type into (again as an obvious blue card) so the user knows exactly what question to answer and the PM agent should know what questions the user is answering in the message. or if that's too complex another way would be to pop open a new kind of model with the "questions for you" and a text area for the user to type their answers, and then send it to the PM agent in the pm tab.

## Screenshots

![Screenshot-2026-09-28-at-01.43.16](/api/tasks/0566/attachments/screenshot-1.png)
![Screenshot-2026-09-28-at-01.43.44](/api/tasks/0566/attachments/screenshot-2.png)

## Activity

- 2026-09-28T04:34:57Z · created · hello@repoos.org
- 2026-09-28T04:34:58Z · screenshots
- 2026-09-28T04:34:58Z · screenshots
- 2026-09-28T04:35:25Z · status draft→inbox, title, area, body
- 2026-09-28T04:36:19Z · review_cli_override, review_model_override
- 2026-09-28T04:36:20Z · review_cli_override
