---
id: "0443"
title: "Debugger: show the triggering message as a human turn when opened via Send to Debugger"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
cli_override: opencode
model_override: openrouter/tencent/hy4-preview
created_at: "2026-09-19T09:02:16Z"
updated_at: "2026-09-19T10:44:42Z"
---
## Problem

When a human uses "Send to Debugger" (e.g. from a failed close-out, a check report, or any other surface that forwards context to the Debugger), the Debugger panel opens and begins working — but the chat log shows no human message. The human sees the assistant's response appearing with no visible prompt, which is confusing: it is unclear what the Debugger received or whether it got the right context.

## Desired behaviour

Any time content is forwarded to the Debugger programmatically (via "Send to Debugger", a repair action, or similar), that content must appear as a human-turn message at the top of the Debugger chat — exactly as it would if the human had typed it themselves. This gives the human:

1. Confirmation of what the Debugger actually received.
2. A natural conversation shape (human → assistant) rather than an assistant message appearing from nowhere.

## Where to look

- The "Send to Debugger" / repair trigger path that POSTs to \`/api/debugger/message\` or equivalent.
- \`DebuggerChat.vue\` — the \`lines\` buffer that renders the conversation; check whether an optimistic human entry is added before the API call, the same way \`send()\` does it.
- The server-side \`/api/debugger/message\` handler — confirm it records the human turn in the session so it survives a reload.

## Acceptance criteria

- [ ] Sending content to the Debugger via any programmatic path shows it as a human-turn message in the chat log
- [ ] The message is visible immediately (optimistic insert) before the assistant responds
- [ ] The message persists in the conversation history after a reload

## Activity

- 2026-09-19T09:02:16Z · created · unknown
- 2026-09-19T10:44:39Z · cli_override
- 2026-09-19T10:44:42Z · model_override
