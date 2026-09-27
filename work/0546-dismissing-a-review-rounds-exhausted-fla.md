---
id: "0546"
title: Dismissing a review-rounds-exhausted flag can be silently undone by an in-flight review
type: bug
status: inbox
priority: p1
area: web
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-27T10:25:52Z"
updated_at: "2026-09-27T10:25:52Z"
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

## Out of scope (already fixed separately, not part of this task)

The native browser `confirm()` popup that used to double-confirm the Dismiss
click was removed in commit c69b369c (2026-09-27) — that part is done, this
task is only about the flag reappearing.

## Activity

- 2026-09-27T10:25:52Z · created · unknown
