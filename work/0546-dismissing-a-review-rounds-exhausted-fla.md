---
id: "0546"
title: "The needs-input banner gives misleading/no feedback: Dismiss can be silently undone, Review again looks like a no-op"
type: bug
status: ready
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: feat/the-needs-input-banner-gives-misleading-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-09-27T10:25:52Z"
updated_at: "2026-09-27T14:28:31Z"
review_rounds: 1
review_passes: 1
handoff_signal_retry_count: 2
---
id: "0546"
title: Dismissing a review-rounds-exhausted flag can be silently undone by an in-flight review
type: bug
status: inbox
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-27T10:25:52Z"
updated_at: "2026-09-27T12:28:39Z"
---
## Problem

On a task's `review-rounds-exhausted` "waiting for you" banner, clicking
**Dismiss** appears to do nothing — the identical banner reappears a moment
later, as if the click was ignored.

## Root cause (traced, not guessed)

`dismissNeedsInputOnTask` (`src/server/needs-input-dismiss.ts`) does correctly
clear `needs_input`/`needs_input_reason`/`needs_input_detail` and commits —
the dismiss itself works.

The reappearance comes from `autoBounce()` in `src/server/review.ts` (~line
1265-1322): whenever ANY review completes (manually triggered via "Review
again" or the automatic post-engineer review) with a non-"good to go" verdict
AND the task's `review_rounds` counter is already `>= MAX_AUTO_REVIEW_ROUNDS`
(2, `src/server/review.ts:133`), it unconditionally re-sets
`needsInputReason: "review-rounds-exhausted"` again — with no check for
whether a human just dismissed that exact flag seconds/minutes earlier.

So the actual sequence that reproduces it:
1. Task is `review`, flagged `review-rounds-exhausted` (rounds already at cap).
2. Human clicks "Review again" (per the banner's own suggested action) —
   this starts a fresh review in the background, which takes roughly a
   minute.
3. While it's running, or right after, the human clicks **Dismiss** on the
   now-stale banner. `needs_input` clears correctly.
4. The in-flight review finishes. If its verdict is still not "good to go",
   `autoBounce`'s exhausted-rounds branch fires again and re-sets the same
   flag — reappearing "a moment later" with no indication to the human that
   a review was still in flight or that this is what happened.

This is arguably not a bug in the dismiss action itself (which does its job),
but a confusing product/UX gap: dismissing a flag whose underlying cause
(an in-flight review that may still come back non-clean) hasn't actually
resolved yet gives no signal that it can legitimately come right back.

## Suggested fixes (pick one or combine)

- Suppress re-raising `review-rounds-exhausted` for some short grace window
  (e.g. a few minutes) after a human dismissed it, OR track whether it was
  dismissed since the review that's about to complete was kicked off, and
  skip the re-raise if so.
- Make the banner/UI aware a review is in flight and disable/relabel
  "Dismiss" while one is running, rather than letting a human dismiss a flag
  whose cause hasn't resolved.
- At minimum, when `autoBounce` re-raises the identical reason immediately
  after a recent dismiss, record something in the activity log distinct from
  a fresh escalation, so the "why did this come back" question is
  answerable from the task's own history instead of requiring code tracing.

## Repro / context

Seen live on #0521 (2026-09-27): the "review-rounds-exhausted" banner offered
both "Review again (clears this)" and "Dismiss" side by side; dismissing
while unaware a review was already in flight is exactly the trap above.

## Also: the "2 review rounds" wording is ambiguous — fold in a copy fix

The same banner's text ("Auto-bounce stopped: reached maximum of
`MAX_AUTO_REVIEW_ROUNDS` (2) review rounds") reads as if only 2 reviews ran
total. In fact `review_rounds` counts auto-*bounces* (times sent back to the
engineer), not total review passes:

review #1 (original impl, non-good) → bounce #1 (`review_rounds` → 1) →
review #2 (non-good) → bounce #2 (`review_rounds` → 2) → review #3
(non-good) → `review_rounds (2) >= MAX (2)`, no bounce #3, flags exhausted.

So **3 reviews and 3 engineering passes** actually happened by the time a
human sees this banner, not 2 — confirmed confusing live on #0521
(2026-09-27) reading it as "only 2 rounds ran". Reword the banner text
(`NEEDS_INPUT_BANNER_LABELS`/detail string in
`src/ui-app/src/lib/needs-input-ui.ts` and the `note` string in
`src/server/review.ts`'s `autoBounce()`) to be unambiguous, e.g. "the
reviewer sent this back to the engineer twice and still isn't satisfied —
human review needed" rather than leading with a bare round count.

## Out of scope (already fixed separately, not part of this task)

The native browser `confirm()` popup that used to double-confirm the Dismiss
click was removed in commit c69b369c (2026-09-27) — that part is done, this
task is only about the flag reappearing (and now also the round-count wording
above).

## Second, DIFFERENT-cause finding on the same banner: "Review again" also
## looks like a no-op

Live on #0521 (2026-09-27): clicking **Review again** on this same banner
also appeared to do nothing — the banner stayed byte-for-byte identical.
Unlike the Dismiss case above, this is NOT the flag being cleared and then
re-raised. Confirmed via `ps`: the review genuinely started and kept running
in the background (`opencode run ... Review the task's implementation`) for
about two minutes total. The button just gives no feedback that it's
running.

Root cause (`src/ui-app/src/components/TaskDrawer.vue`):

- `reviewAgain()` (~line 1458) sets `reviewBusy = true` only for the
  duration of `await repo.reviewAgain(id)` — the HTTP call that *starts* the
  review job server-side — then sets it back to `false` once that POST
  resolves, typically well under a second. It does not track the review
  agent process itself, which keeps running for roughly a minute afterward.
- This banner's button (~line 3324) is disabled only on
  `ui.saving || startingWork || reviewBusy || dismissNeedsInputBusy` — no
  `review?.running`.
- The app already has and uses a proper `review.running` reactive flag
  elsewhere for the exact same situation: the Review tab's own "Review
  again" button (~line 3824) disables on `review?.running` and shows a
  "Starting…" label. This banner's button just never wires into it.

Fix: add `review?.running` to this button's `:disabled` condition (matching
the Review tab's own button) and show a busy/"reviewing…" state on it too,
so a genuinely-in-progress review is visibly different from a click that did
nothing.

## Activity

- 2026-09-27T10:25:52Z · created · unknown
- 2026-09-27T12:28:39Z · body
- 2026-09-27T13:16:02Z · title, body
- 2026-09-27T13:35:06Z · cli_override, model_override
- 2026-09-27T13:35:18Z · model_override
- 2026-09-27T13:35:22Z · status inbox→ready
- 2026-09-27T13:35:23Z · status ready→active, branch
- 2026-09-27T14:04:55Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-27T14:09:57Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-09-27T14:09:57Z · status review→active
- 2026-09-27T14:12:33Z · status active→review
- 2026-09-27T14:17:31Z · status review→active
- 2026-09-27T14:28:31Z · status active→ready
