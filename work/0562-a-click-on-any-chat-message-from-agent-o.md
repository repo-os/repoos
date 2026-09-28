---
updated_at: "2026-09-28T01:05:36Z"
review_passes: 4
id: "0562"
title: Copy a chat message on click
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/copy-a-chat-message-on-click
created_at: "2026-09-28T00:01:18Z"
review_rounds: 2
---
## Problem

Copying anything out of a chat in RepoOS means selecting the text by hand: drag across a bubble, hope you caught the whole message, then paste. Assistant replies are often the thing you want to take somewhere else — a plan into a task, a code snippet into an editor, a human's instruction into another thread — and there is no faster path than the text itself. The messages are already plain text in the store, so the copy is right there; only the interaction is missing.

## Desired UX

- Clicking anywhere inside a chat message bubble — an agent reply or a human message — copies that whole message.
- A toast confirms it, using the existing toast panel: a success toast reading `Message copied`.
- Nothing else about the message changes. It is still selectable, still scrolls into view, and the copy is not a visible "edit" or "delete" of anything.
- Works the same in every chat surface, so the behaviour is not something a user has to learn twice.

## Acceptance criteria

- [ ] Clicking an agent (assistant) message bubble copies that message's full text to the clipboard.
- [ ] Clicking a human message bubble does the same.
- [ ] A success toast (`Message copied`) appears in the existing `ToastPanel` on every successful copy.
- [ ] A failed copy surfaces an error toast rather than the success one, matching the existing `CopyableNumber.vue` pattern.
- [ ] The behaviour is present in every chat surface that renders messages, including the task agent transcript and its review transcript, the PM chat surface, the debugger chats, the Repo Guide chat, and the CTO panel.
- [ ] Copies go through the existing `copyToClipboard` helper in `src/ui-app/src/lib/clipboard.ts`, so plain-HTTP LAN/Tailscale origins keep working via its `execCommand` fallback.
- [ ] Selecting text inside a message (drag to select, then release) does not fire the copy.
- [ ] Tool-call rows, diagnostic lines, system/notice lines and streaming in-progress output do not copy.
- [ ] A unit test covers the copy decision helper (copy / no-copy cases) and at least one surface wires it to both `human` and `text` rows.

## Notes for AI

**Assumptions chosen, since the request was a one-liner.** Each of these is a default, not a confirmed requirement — flag it in review if any is wrong.

- **Assistant messages copy their markdown source**, i.e. `row.text` as it comes off the display row, not the text scraped back out of the rendered `v-html`. This keeps fenced code blocks and list structure intact when pasted.
- **Status lines are out of scope.** `bubbleRole()` returns `human`, `assistant`, `status` or `null`; only `human` and `assistant` copy. Tool rows, plain `line` rows and `sys` rows are not "messages" and are left alone.
- **Interactive elements inside a message win.** Assistant messages are rendered as HTML and can contain links; a click whose target is an `a`, `button`, or `input` navigates/activates and does *not* also copy.
- **A non-empty text selection suppresses the copy.** This is the one place the request collides with existing behaviour, so it is worth doing deliberately: a drag-select that ends inside the message would otherwise fire `click` on release and clobber the selection the user just made.
- **Mouse click only.** No keyboard-activation or focus-based copying is implied by the request, and a `role="button"` on every bubble would wreck text selection and the log's screen-reader semantics. If keyboard access is wanted, it should be a separate task.
- **Use the existing toast.** `repo.pushToast(message, "success")` / `"error"`, the same call `CopyableNumber.vue` makes. Do not build a new toast mechanism, and do not change `TOAST_TIMEOUT` or the 100ms dedup window to cope with rapid repeated clicks.

**Where the code is.** The copy decision is a small, pure function — put it somewhere shared (a new module in `src/ui-app/src/lib/`, or next to `chat-rows.ts` / `clipboard.ts`) and call it from the surfaces, rather than copy-pasting the same handler into six components. Message rows are rendered in:

- `src/ui-app/src/components/TaskDrawer.vue` — the agent transcript (~line 3900) and the review transcript (~line 4160)
- `src/ui-app/src/components/PmChatSurface.vue` (~line 180)
- `src/ui-app/src/components/DebuggerChat.vue` (~line 259)
- `src/ui-app/src/components/TaskDebuggerChat.vue` (~line 241)
- `src/ui-app/src/components/RepoGuideChat.vue` (~line 206)
- `src/ui-app/src/components/CTOPanel.vue` (~line 150)

The four bubble-based surfaces all branch on `bubbleRole(row)` from `src/ui-app/src/lib/chat-rows.ts`; `TaskDrawer.vue` branches on `row.kind` (`"human"` / `"text"`). Attach the handler to the bubble/row element, not to the log container, so one click copies one message.

**Do not:** store anything (this is view-layer only, like the #0506 row-grouping — the transcript on disk and over SSE is unchanged); add a hover-only copy button or any per-message chrome; change message layout, colours or spacing; make a click on a message do anything else (no "mark read", no scroll, no selection change).

**Conventions:** TypeScript with NodeNext `.js` import specifiers; tests with `bun run test` (vitest), never bare `bun test`. After the change run `bun run fmt`, rebuild (`bun run build:ui` is enough if only UI changed), and `repoos check --changed main` before requesting handoff.

## Scope

**In:** click-to-copy plus the confirming toast, applied to every chat surface that renders agent and human messages.

**Deferred:** a visible copy affordance (button or hover hint), keyboard-triggered copy, copying a single message's raw tool-call payload, and copying multi-message selections or a whole conversation.

## Related

- #0506 — chat row grouping (`src/ui-app/src/lib/chat-rows.ts`); the `MessageRow` shape this reads its copy text from
- `src/ui-app/src/lib/clipboard.ts` — the copy helper and its insecure-origin fallback to reuse
- `src/ui-app/src/components/CopyableNumber.vue` — the existing copy-then-toast pattern to mirror

## Original prompt

A click on any chat message (from agent or human) should automatically copy the message and show a toast that it was copied.

## Activity

- 2026-09-28T00:01:18Z · created · hello@repoos.org
- 2026-09-28T00:02:57Z · status draft→inbox, title, area, body
- 2026-09-28T00:06:10Z · status inbox→ready
- 2026-09-28T00:06:14Z · status ready→active, branch
- 2026-09-28T00:13:27Z · status active→review
- 2026-09-28T00:14:51Z · status review→active
- 2026-09-28T00:21:38Z · status active→review
- 2026-09-28T00:22:26Z · status review→active
- 2026-09-28T00:32:06Z · status active→review
- 2026-09-28T00:36:26Z · needs_input
- 2026-09-28T01:05:36Z · needs_input

