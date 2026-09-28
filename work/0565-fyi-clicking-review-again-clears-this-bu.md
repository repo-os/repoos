---
id: "0565"
title: Review Again (clears this) leaves the needs-input warning card visible while the fresh review runs
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/review-again-clears-this-leaves-the-need
pm_model_override: opencode/muse-spark-1.3-contributor-free
created_at: "2026-09-28T04:05:24Z"
updated_at: "2026-09-28T04:22:02Z"
---
## Problem

On a task showing the needs-input warning card ("waiting for you"), the primary button is labeled "Review Again (clears this)". Clicking it does start a fresh review in the background, but the warning card stays visible — unlike **Dismiss**, which makes the card disappear immediately. The "(clears this)" label promises the Dismiss-like behavior, so the card lingering reads as "nothing happened" (same no-feedback class of issue as #0546's second finding on #0521).

## Expected vs actual

- Expected: clicking "Review Again (clears this)" hides the warning card immediately (same as Dismiss), while the fresh review runs. If the fresh review comes back clean, the flag stays cleared; if it fails / is still not clean, the flag is re-raised with the new result.
- Actual: the review starts (verifiable via `ps` / Review tab activity), but the card stays byte-for-byte identical, so the user can't tell anything happened except by switching tabs.

## Context / root cause (traced, not guessed)

- Banner copy + button label live in `src/ui-app/src/lib/needs-input-ui.ts` (`REVIEW_AGAIN_ACTION`, `NEEDS_INPUT_SUGGESTION_LABELS` — the latter even says "Review again runs a fresh review and clears this if it comes back clean", i.e. delayed clear).
- Banner rendering + actions live in `src/ui-app/src/components/TaskDrawer.vue`: `runNeedsInputPrimaryAction()` (`action.kind === "review"` branch) just switches to the Review tab and calls `reviewAgain()` → `repo.reviewAgain(id)` → `POST /api/tasks/:id/review/again`.
- Server `reviewAgain` (`src/server/routes/tasks.ts`) only does `void reviews.run(existing)` and returns `{ ok: true }` — it never clears `needsInput`. The flag is only cleared later, when a clean review completes. `dismissNeedsInputFlag()` in the same component, by contrast, calls `POST .../needs-input/dismiss`, syncs the updated task, and the card's `v-if="...needsInput..."` hides it instantly.
- Partial mitigation exists only for one reason: `TaskDrawer.vue` swaps the banner sub-text to "A fresh review is running..." when `needsInputReason === "review-rounds-exhausted" && review?.running`. Other reasons (`review-failed`, `watchdog-stuck`) get no such feedback, and even in the exhausted case the card itself remains.

## Repro

1. Get a task in `review` with `needsInput=true` and a review-capable reason (e.g. `review-failed`, `watchdog-stuck`, or `review-rounds-exhausted`).
2. Open the task drawer, note the "waiting for you" card with "Review Again (clears this)" + "Dismiss" side by side.
3. Click "Review Again (clears this)".
4. Observe: a fresh review starts (Review tab shows activity), but the warning card remains visible. Clicking Dismiss instead makes it vanish immediately.

Reported live 2026-09-28 (see attached screenshots).

## Acceptance criteria

- [ ] Clicking "Review Again (clears this)" on the needs-input card hides the card immediately (optimistic clear, same visual result as Dismiss) and shows the fresh review's running state in the Review tab.
- [ ] The `needsInput` flag itself is cleared or suppressed at click time so the card does not linger during the run — not only after the review completes.
- [ ] If the fresh review completes clean, the flag stays cleared. If it fails / comes back not-clean, the appropriate needs-input flag is re-raised (with activity-log entry) so a real problem is never silently swallowed.
- [ ] Behavior is consistent across all `needsInputReason`s that offer the Review-again primary action (`review-failed`, `review-rounds-exhausted`, `watchdog-stuck`), not just the exhausted case that already has the "fresh review is running" sub-copy.
- [ ] If the button label keeps "(clears this)", the behavior matches the label; alternatively relabel if the chosen semantics are "clears on clean result only" — label and behavior must agree.

## Notes / edge cases

- Related: #0546 (Dismiss silently undone by in-flight review; "Review again looks like a no-op"). This task is the follow-through: make Review-again's clear immediate and visible.
- Careful not to reintroduce #0546's trap in reverse: an optimistic clear must not prevent the fresh run's failure from re-raising the flag. The re-raise path (`autoBounce()` in `src/server/review.ts`, reviewer-failure escalation) must still fire after an optimistic clear.
- Check `needsInputHeaderChip` / `needsInputSuppressedOnReview` interplay so the board-card chip and drawer banner stay consistent while the review runs.

## Out of scope

- Changing what counts as a clean vs non-clean verdict, round-count wording (covered in #0546), or the Review tab's own stale-report display (`reviewStale`).

## Original prompt

FYI, clicking "Review Again (clears this)" button, does start the review again, but it doesn't actually "clear this" in the same way that dismiss button make the warning card go away, which is what I would expect it to do too. so please make that card disappear when "review again" is clicked too.

## Screenshots

![Screenshot-2026-09-28-at-11.20.49](/api/tasks/0565/attachments/screenshot-1.png)
![Screenshot-2026-09-28-at-11.20.41](/api/tasks/0565/attachments/screenshot-2.png)

## Activity

- 2026-09-28T04:05:24Z · created · hello@repoos.org
- 2026-09-28T04:05:24Z · screenshots
- 2026-09-28T04:05:24Z · screenshots
- 2026-09-28T04:08:24Z · note: Freeform PM run failed: the opencode agent timed out after 180s
- 2026-09-28T04:08:24Z · needs_input
- 2026-09-28T04:20:08Z · pm_model_override
- 2026-09-28T04:20:10Z · needs_input
- 2026-09-28T04:21:18Z · title, area, type, body
- 2026-09-28T04:21:58Z · status draft→inbox
- 2026-09-28T04:21:59Z · needs_input
- 2026-09-28T04:22:01Z · status inbox→ready
- 2026-09-28T04:22:02Z · status ready→active, needs_input, branch
