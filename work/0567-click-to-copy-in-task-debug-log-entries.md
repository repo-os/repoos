---
id: "0567"
title: Click-to-copy in task debug log entries
type: ux
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/click-to-copy-in-task-debug-log-entries
pm_model_override: opencode/muse-spark-1.3-contributor-free
created_at: "2026-09-28T05:07:19Z"
updated_at: "2026-09-28T11:57:26Z"
---
## Problem

In the task Debug tab (Logs view in `DebugPanel.vue`), there is no quick way to grab the text of a log entry. Users debugging a failed check, handoff, or agent run must manually drag-select the entry text, which is fiddly for multi-line details (check output, log context JSON, long activity lines).

Chat messages already support click-to-copy (see `useCopyChatMessage.ts` + `chat-message-copy.ts` + `lib/clipboard.ts`): clicking a message bubble copies its text and shows a toast. Debug entries should behave the same way.

## Current behavior

- The Logs view renders a unified `debug-events` list (`activity` / `log` / `check` kinds) as `.debug-event` cards with a kind chip, title, relative time, and optional expanded `detail` / check output (`DebugPanel.vue:322-357`).
- Clicking an expandable row only toggles expand/collapse (`toggleExpanded`). There is no clipboard affordance.
- Text can only be copied via manual selection.

## Proposed behavior

Clicking inside a debug log entry card copies that entry's full visible text to the clipboard and shows a brief visual confirmation, matching chat-message copy UX.

### Copy content per entry kind

- `activity`: `title` (+ `detail` when present — currently same text; copy the full untruncated text, not the CSS-ellipsized one-liner).
- `log`: `title` + `detail` (context JSON) when expanded/present, e.g. `"<message>\n<context JSON>"`. When no detail, just the message.
- `check`: `title` + failure summary + full check output when available (same text shown in the expanded `<pre>`), e.g. `"<title>\n<failureSummary>\n<output>"`, omitting missing parts. Copy the full output even if the row is collapsed (users copy to paste into a bug report without expanding first).
- Include the timestamp/kind label only if trivially cheap — at minimum the title + body as requested in the original report. Prefer `title + body`, not just the truncated title line.

Use the shared `copyToClipboard()` helper (`src/ui-app/src/lib/clipboard.ts`) so plain-HTTP LAN origins get the `execCommand` fallback.

### Interaction rules (parity with chat copy)

- Follow `shouldCopyMessageOnClick` semantics from `chat-message-copy.ts`:
- Do NOT hijack the click when the user has an active text selection (they are trying to select, not copy-all).
- Do NOT hijack clicks on interactive descendants (`a, button, input, textarea, select`) — e.g. the expand chevron area should still toggle, links remain clickable.
- Expand/collapse must keep working: a copy-click on an expandable row should both copy and preserve the existing toggle behavior (or copy without breaking toggle — implementation's choice, but both must work).
- Non-expandable rows (no detail, not a check) become clickable for copy as well; add pointer affordance only where click does something.
- The live running-check output card (`.debug-live`) is out of scope for click-to-copy unless trivial — it streams and has scroll/selection needs.

### Confirmation

- On success: brief visual confirmation. Preferred: reuse the existing toast pattern (`repo.pushToast("Message copied", "success")`, cf. `useCopyChatMessage.ts:16`) so behavior matches chat exactly. A card flash / "Copied" tooltip is an acceptable alternative or addition, but the toast alone satisfies parity.
- On failure (`copyToClipboard` returns false): toast `"Could not copy …"` error, same as chat copy.

## Acceptance criteria

- [ ] Clicking a debug entry card (activity, log, or check kind) copies that entry's full text (title + body/detail/output, untruncated) via `copyToClipboard()`.
- [ ] Success shows a toast (and/or inline "Copied" flash) ; failure shows an error toast instead of pretending it worked.
- [ ] Clicking with an active text selection does NOT trigger copy-all (manual selection still works).
- [ ] Clicks on interactive elements inside the entry do NOT trigger copy.
- [ ] Expand/collapse still works for check/detail rows.
- [ ] Existing Debug tab filters, live-check card, and Debugger view are unaffected.

## Out of scope

- Copy buttons per row, bulk "copy all logs", or downloading logs as a file — this task is click-card-to-copy only. File follow-ups if wanted.
- Changing the live streaming check output card's selection behavior.
- Keyboard-accessibility additions beyond what chat bubbles already do (note any gap as a follow-up, don't block on it).

## Technical notes (non-binding)

- Likely touchpoint: `src/ui-app/src/components/DebugPanel.vue` event list (`filteredEvents`, `.debug-event` click handler). Consider extracting a `copyTextForDebugEvent(e)` helper mirroring `copyTextForBubbleRow`, plus a test mirroring `tests/chat-message-copy.test.ts`.
- Cursor/selection affordance: `debug-event-expandable` already sets `cursor: pointer`; extend hover styling to copyable non-expandable rows so clickability is discoverable.

## Activity

- 2026-09-28T05:07:19Z · created · unknown
- 2026-09-28T05:08:18Z · pm_model_override
- 2026-09-28T05:09:26Z · body
- 2026-09-28T06:31:11Z · status inbox→ready
- 2026-09-28T11:42:59Z · status ready→active, branch
- 2026-09-28T11:51:32Z · status active→review
- 2026-09-28T11:57:26Z · status review→done, release:success
