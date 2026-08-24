---
id: "0283"
title: "Show a canned \"flesh this out\" prompt above the chat input"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/show-a-canned-flesh-this-out-prompt-abov
created_at: "2026-08-24T17:45:48Z"
updated_at: "2026-08-24T18:28:38Z"
---
## Problem

When a task is only a stub — because it was drafted or an AI didn't fully
flesh it out — the first thing a user often wants to do is ask the PM agent to
expand it. That "can you flesh this out?" message is frequently the *very first*
message a user sends to the PM agent for such a task, so it's a natural fit for
a canned message. Today there is no such affordance, so the user has to type it
out manually every time.

## Desired UX

When a task is in the `draft` or `inbox` state, show a short list of canned
messages directly above the chat input. This list is only visible before any
message has been sent to the PM agent for that task.

- The primary canned message is "flesh this out" (or equivalent wording
  matching the user's intent of asking the PM to expand the stub).
- If the user clicks a canned message, that message is sent to the PM agent and
  the canned message list is hidden.
- The canned message list is shown only initially — i.e. only while no message
  has been sent to the PM agent yet — and only in the `draft` and `inbox`
  task states.

## Acceptance criteria

- [ ] A canned message list is rendered above the chat input.
- [ ] The list appears only when the task state is `draft` or `inbox`.
- [ ] The list appears only when no message has been sent to the PM agent for
      that task yet.
- [ ] The canned list includes a "flesh this out" message (and may include any
      other sensible defaults).
- [ ] Clicking a canned message sends that message to the PM agent.
- [ ] After a canned message is sent, the canned message list is hidden for the
      task.
- [ ] Once any message has been sent to the PM agent (canned or typed), the
      canned message list no longer shows.

## Notes for AI

- The canned message behavior is scoped to the `draft` and `inbox` task states
  only; other states should not show the list.
- "No messages sent to the PM agent" is the initial condition described; use the
  first message sent to the PM as the point at which the list is dismissed.
- The exact wording of the canned message is not specified; a reasonable default
  is a message like "Can you flesh this out?" or similar, which I assume the code
  will pick and make easy to adjust.
- Only the web UI is in scope; the exact chat/task-drawer component to modify
  should be located under `src/ui-app/`.

## Scope

- In scope: showing the canned message list in `draft`/`inbox` states, sending
  the clicked message, hiding the list after first send.
- Deferred: editing/creating user-defined canned messages; showing canned
  messages in other task states.
---

## Original prompt

Often when a task is just a stub (because an it was a draft or an AI didn't full flesh it out) then I often need to just ask the PM agent simply "can you flesh this out?" it seems like a good usecase for canned messages since that's often the first message I send to the PM agent, so let's show that right above the chat input when the task is in draft or inbox state and there's not been any messages sent to the pm yet. if the user clicks on it, then send that message to the pm and hide the canned messages list. so basically we only show the canned messages list initially before any messages have been sent to the PM agent, and this canned message is only relevant in the 2 task states I mentioned

## Activity

- 2026-08-24T17:46:50Z · status draft→inbox, title, area, body
- 2026-08-24T17:47:14Z · status inbox→ready
- 2026-08-24T18:28:38Z · status ready→active, branch
