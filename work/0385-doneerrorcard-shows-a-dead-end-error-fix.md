---
id: "0385"
title: DoneErrorCard shows a dead-end error + Fix button even when auto-repair is already running
type: bug
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-17T08:22:45Z"
updated_at: "2026-09-17T09:24:33Z"
---
## Problem

When a Move-to-done job fails with a check failure, a merge conflict, or a
missed handoff signal, `handoff.ts` (`scheduleCheckFailureRetry`,
`scheduleMergeConflictRetry`, `scheduleHandoffSignalRetry`) automatically
resumes the engineer to fix it — capped at `MAX_*_RETRY_ATTEMPTS` (2), no
human action needed while a retry is in flight.

`TaskCard.vue` (the board) already knows this and shows the right thing:
`checkRetryHint`/`mergeConflictRetryHint`/`handoffSignalRetryHint`
(~lines 250-335) read the task's `check_retry_count` /
`merge_conflict_retry_count` / `handoff_signal_retry_count` frontmatter and
render "fixing merge conflict (retry 1/2)" with an explanatory title, or a
"stuck · silent Ns" variant if the agent's gone quiet too long.

`DoneErrorCard.vue` (the task drawer's error display) has none of this. It's
a generic component (`message`/`step`/`conflicts`/`detail`/`hint` props) that
always renders the same way: a red error block and a "Fix" button that POSTs
to `/api/tasks/:id/debugger/message`, spawning a NEW debugger investigation —
regardless of whether an auto-repair is already running. A user who opens the
drawer during a covered retry sees what looks like a dead-end failure
requiring their action, with a button that would spawn a REDUNDANT debugger
session on top of the repair already in progress.

Confirmed live, 2026-09-17 (task #0382): user clicked Move-to-done, saw the
red error + Fix button in the drawer, had no indication anything was already
being handled, and only found out via the (correctly implemented) board card
after reloading the page — they hadn't looked at the board while the drawer
was open. In their words: "I clicked mtd, saw the error in red and it shows
the 'fix' button but didn't tell me... I only noticed when I reloaded."

## Fix direction

`DoneErrorCard.vue` (or its caller, `TaskDrawer.vue`, which has the full task
object already) needs the same retry-state awareness `TaskCard.vue` already
has, and should show equivalent messaging in place of (or clearly alongside)
the "Fix" button when a covered auto-repair is in flight:
- Extract the three `*RetryHint` functions out of `TaskCard.vue` into a
  shared location (a composable or plain exported function) both components
  import, rather than reimplementing the same `check_retry_count`/
  `merge_conflict_retry_count`/`handoff_signal_retry_count` logic a second
  time — two independent copies is exactly how they'd drift out of sync
  again later.
- When a covered retry is in flight, replace or supplement the drawer's
  message with the same "the engineer is automatically resolving it" framing
  TaskCard already uses, and either hide the "Fix" button or relabel it
  (e.g. "Investigate anyway" / "Force debugger") so a human who clicks it
  understands they're starting something ADDITIONAL to the automatic repair,
  not the only path forward.
- Once the retry cap is reached (`retries >= MAX_*_RETRY_ATTEMPTS`), the
  automatic path gives up and calls `runner.persistHandoffFailure` — THAT
  case should still show the normal dead-end error + Fix button, since
  there's genuinely nothing else auto-retrying at that point. Don't suppress
  the button unconditionally, only while a covered retry is actually active.
- Verify there's no SSE/live-update gap causing a reload to be needed once
  the messaging itself is fixed — the retry-count write in `handoff.ts` does
  call `onFileChange?.(absPath)` → `index.applyFileChange(...)`, which should
  already notify listeners live; confirm this actually reaches the open
  drawer's reactive state without a manual reload, and fix if it doesn't.

## Acceptance criteria

- [ ] Opening the task drawer while a covered check-failure/merge-conflict/
      handoff-signal retry is in flight shows the same "being automatically
      resolved" framing the board card already shows — not a bare red error
      implying the human must act.
- [ ] The "Fix"/debugger button's behavior during an active retry is
      explicit about what it does (starts something additional, doesn't
      replace the automatic repair) rather than looking like the only path.
- [ ] Once retries are exhausted and `persistHandoffFailure` fires, the
      drawer reverts to today's normal dead-end error + Fix button — this
      case is unaffected.
- [ ] Retry-hint logic lives in one place, imported by both `TaskCard.vue`
      and `DoneErrorCard.vue`/`TaskDrawer.vue`, not duplicated.
- [ ] Confirmed (and fixed if needed) that the messaging updates live via
      SSE without requiring a manual page reload.
- [ ] `repoos check` passes.

## Related

- #0271 — established the three auto-repair retry paths and TaskCard's
  existing hint logic this task extends to the drawer.
- #0382 — the real task run that surfaced this gap.

## Activity

- 2026-09-17T08:22:45Z · created · unknown
- 2026-09-17T09:24:33Z · status inbox→ready
