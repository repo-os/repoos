---
id: "0294"
title: Extend PM chat canned questions across the task lifecycle
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/extend-pm-chat-canned-questions-across-t
model_override: default
pm_model_override: default
review_model_override: default
created_at: "2026-08-25T05:55:32Z"
updated_at: "2026-08-25T06:46:15Z"
review_passes: 1
handoff_signal_retry_count: 1
---
## Problem

The PM chat's "canned questions" feature only exists at the very start of a task's life. Right now
it's a hardcoded, two-item list used to flesh out a stub into a full spec, and it disappears
forever the moment a PM conversation exists or the task leaves `draft`/`inbox`. There's no
equivalent for later stages — a human looking at an `active` or `review` task has no quick way to
ask "what's going on with this task?", "what's wrong?", "what should I do next?", or "how do I get
this into review?" without typing a fresh question into PM chat every time.

## Current state

- Canned question text: `src/ui-app/src/components/TaskDrawer.vue:920-923` — a flat, hardcoded
  `pmCannedMessages` array (`"Can you flesh this out?"`, `"Suggest how to turn this stub into a
  complete task."`). Not computed, not keyed by task status or anything else.
- Visibility gate: `TaskDrawer.vue:926-930` (`showPmCanned`) — shown only when
  `task.status === "draft" || task.status === "inbox"` AND `!pmHasConversation`. Once you've sent
  one PM message, or the task moves past inbox, the canned prompts are gone for good.
- Click behavior: `pmSendCanned` (`TaskDrawer.vue:933-936`) sets the draft text and calls
  `pmSend()` immediately — clicking a canned question auto-sends it, no edit step. Keep this
  behavior; don't add an edit-before-send step for this task.
- Rendering: `TaskDrawer.vue:3168-3173` (template `v-for` over `pmCannedMessages`),
  styles at `TaskDrawer.vue:3477-3507`.
- Existing per-status map precedent to follow: `STATUS_COLORS: Record<string, string>` in
  `src/ui-app/src/stores/repo.ts:130-137`, with a `statusColor(s)` accessor at line 139.

## Fix direction

1. Replace the flat `pmCannedMessages` array with a status-keyed map, e.g.
   `PM_CANNED_MESSAGES: Partial<Record<Status, string[]>>`, following the same shape/placement
   pattern as `STATUS_COLORS` in `repo.ts`. Keep the existing two draft/inbox prompts as that
   status's entries so today's "flesh this out" flow is unchanged.
2. Add a set for later stages, informed by the questions that prompted this task:
   - `active`: "what's going on with this task?", "what's wrong?", "what should I do next?"
   - `review`: "what's blocking this from being done?", "is this actually ready?"
   - Leave `ready`/`done` out for now unless an obvious set of questions falls out of the above
     (don't force a list where there isn't a clear need yet).
3. Update `showPmCanned` to key off the new map instead of the hardcoded draft/inbox check, and
   drop the `!pmHasConversation` condition — later-stage canned questions need to be askable
   repeatedly throughout a task's life, not just once before the first message. (The draft/inbox
   behavior of "only offer this before the user has already started fleshing it out" was
   intentional there; confirm it still reads sensibly once the same gate also serves every other
   stage, or split the two concerns if it doesn't.)
4. Auto-send stays as-is (per the decision above — no edit step is being added here).

## Acceptance criteria

- Canned question chips render in PM chat for `active` and `review` tasks, not just
  `draft`/`inbox`, with the sets listed above (or a reasonable equivalent if the engineer finds a
  better phrasing while implementing).
- Canned questions remain visible/askable even after a PM conversation already exists, for any
  status that has a defined set.
- The existing `draft`/`inbox` "flesh this out" behavior is unchanged (same prompts, same
  auto-send).
- Clicking a canned question still auto-sends immediately, matching current behavior.
- `repoos check` green.

## Out of scope

- No edit-before-send step — clicking a canned question sends immediately, as today.
- No new chat surface — this extends the existing PM chat, not Debugger or Engineer chat (see
  discussion in this task's origin conversation: PM chat is the right fit because it already
  understands full task lifecycle state, not just a narrow slice like close-out failures).
- Not attempting `ready`/`done`-stage canned questions unless they fall out naturally.

## Related

None yet — this is a net-new UX affordance, not a bugfix.

## Activity

- 2026-08-25T05:55:32Z · created · unknown
- 2026-08-25T06:26:00Z · status inbox→ready
- 2026-08-25T06:26:16Z · pm_model_override
- 2026-08-25T06:26:28Z · status ready→active, branch
- 2026-08-25T06:41:32Z · status active→review
- 2026-08-25T06:45:34Z · review_model_override
- 2026-08-25T06:45:34Z · model_override
