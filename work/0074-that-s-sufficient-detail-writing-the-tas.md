---
id: "0074"
title: Auto-scroll agent chat to latest message and show the human's own messages
type: bug
status: review
needs_merge: true
priority: p2
area: agent
assigned_to: ai
created_by: ""
branch: feat/auto-scroll-agent-chat-to-latest-message
created_at: "2026-08-11T05:06:07Z"
updated_at: "2026-08-11T13:02:01Z"
---
---
## Problem

The Agent tab in the task drawer (`src/ui-app/src/components/TaskDrawer.vue`) has two related problems that make it hard to follow a conversation with the agent:

1. **No initial scroll-to-bottom / no way back to the latest message.** There's a "stick to bottom" behavior while new output streams in (`stick.value` in `TaskDrawer.vue`), but nothing forces the view to the bottom when the user first opens the Agent tab or switches to a task, and there's no affordance to jump back down after scrolling up to read history. If the transcript is long, opening the tab can drop the user somewhere in the middle.
2. **The user's own chat messages never render.** `sendMessage` sends the human's typed follow-up to the agent, but the `DisplayEntry` model (`kind: "line" | "text" | "tool" | "step" | "sys"`) has no case for a human/user message, so nothing the user typed ever appears in the transcript. Only the agent's replies and tool activity show up, so it's hard to tell what was actually asked or when.

## Desired UX

- When the user opens the Agent tab (or switches tasks while it's active), the chat log is scrolled to the bottom (the most recent message), not wherever it happened to be.
- While reading up in the history (scrolled away from the bottom), a "jump to latest" down-arrow button appears (e.g. floating at the bottom of the log). Clicking it scrolls to the bottom and re-enables the existing stick-to-bottom behavior.
- The button disappears once the user is back at (or near) the bottom.
- Every message the human sends to the agent (via the follow-up input / `sendMessage`) appears in the transcript as its own chat entry, visually distinguishable from the agent's text and from tool/step/sys entries, in the correct chronological position.

## Acceptance criteria

- [ ] Opening the Agent tab for a task, or switching the drawer to a different task while the Agent tab is active, scrolls the log to the bottom on load (after the transcript hydrates via `repo.loadOutput`).
- [ ] Scrolling up in the log (away from bottom) surfaces a "jump to latest" button; it is hidden when the log is at (or within the existing ~40px `stick` threshold of) the bottom.
- [ ] Clicking the jump-to-latest button scrolls smoothly to the bottom and restores stick-to-bottom auto-scroll for subsequent new output.
- [ ] New agent output arriving while the user is scrolled up does NOT force-scroll them down (existing `stick` behavior is preserved) but the jump-to-latest button stays visible/available.
- [ ] Sending a message via the Agent tab's input immediately renders that message in the transcript as a distinct "human"/user entry (own visual style, not mistaken for agent text), without waiting for a server round-trip or page reload.
- [ ] Human messages sent in past turns (already persisted in a task's output/transcript) also render correctly on reload — not just newly-sent ones.
- [ ] `repoos check` passes (build, tests, ui-smoke).

## Notes for AI

- Primary file: `src/ui-app/src/components/TaskDrawer.vue` — `DisplayEntry` interface, `displayEntries` computed, `stick`/`onLogScroll`/the `watch(displayEntries, ...)` auto-scroll effect, and `sendTurn`/`sendMessage` call around line 533.
- Add a new `DisplayEntry` kind (e.g. `"human"`) and make sure both the live-send path (optimistic render in `sendTurn`) and the persisted-output path (`repo.outputs[...]`, whatever the server/store shape is for a sent turn) map to it. Check how the server records a sent message in the transcript (`src/server/*`) — it may need a `type: "human"`-equivalent entry added server-side if one doesn't already exist, since the bug is that the human side is dropped somewhere in the pipeline, not just unstyled.
- Reuse the existing `stick` ref/threshold logic for the jump-to-latest button's visibility rather than adding a second scroll-tracking mechanism.
- Do not change the streaming/stick-to-bottom behavior for in-flight agent output — only add the initial-scroll-on-open and the manual jump-to-latest control.
- Assumption: "high up in the chat" means any scroll position outside the existing ~40px-from-bottom `stick` threshold; reuse that threshold for the button rather than inventing a new one.
- Verify manually in a browser: open a task with a long transcript, confirm it opens at the bottom, scroll up, confirm the button appears and works, send a message, confirm it appears immediately and after a reload.

## Activity

- 2026-08-11T05:06:07Z · created · unknown
- 2026-08-11T05:07:06Z · title, branch, body
- 2026-08-11T05:09:53Z · status inbox→ready
- 2026-08-11T12:31:06Z · needs_merge
