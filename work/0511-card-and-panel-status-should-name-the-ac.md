---
id: "0511"
title: "Card and panel status should name the actual problem, not generic needs-input/working labels"
type: feature
status: review
needs_input: true
needs_input_reason: dev-error
needs_input_detail: the agent process exited with an error — open the task to see the full output
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/card-and-panel-status-should-name-the-ac
review_model_override: opencode-go/space-bunny-free
created_at: "2026-09-26T03:19:13Z"
updated_at: "2026-09-26T04:32:05Z"
dev_error_count: 2
---
## Problem

A task that needs a human shows labels that don't say what's wrong, and
sometimes claim work is happening when nothing is running.

**Example: #0506 (2026-09-26).** The reviewer (`opencode-go/mimo-v2.6-flash`)
crashed mid-run without writing a report (`needs_input_reason: review-failed`).
The board card showed a **NEEDS INPUT** chip plus a footer **"waiting for
review"** with the pulsing "working" dots; the task panel header showed
**NEEDS INPUT** and **AWAITING REVIEW**. Nothing was running. The only accurate
text was the panel's "Waiting for you" banner.

Causes:
- `TaskCard.vue` (~L463): any `review` task without a verdict falls back to
  "waiting for review" / `tc-reviewing` (animated), whether or not a review is
  actually running or has crashed.
- `TaskDrawer.vue` `reviewSubstate` (~L1193): same fallback → "awaiting review".
- The "needs input" chip (`TaskCard.vue` ~L482/757, `TaskDrawer.vue` ~L2930)
  says only that something needs the human, not what.

Separately, there's no way for a human to clear `needs_input` directly; it's not
obvious which action clears it (e.g. Restart work clears a dev-error, a clean
review clears review-failed, MTD clears everything). Some reasons also have no
suggestion text: `check-failed-after-retries` fell back to the generic "The
agent needs your input" on #0499.

## Changes

1. **Drop the "needs input" chip from the card header.** The card's
   highlighted outline is the "needs you" signal.
2. **Card status line names the reason**, from `needs_input_reason`, with a
   static warning icon (no animation), e.g.:
   - `review-failed` → "Reviewer failed — no report"
   - `dev-error` → "Agent exited with an error"
   - `check-failed-after-retries` → "Checks failed after retries"
   - `cto-escalation` / questions → "Agent asked a question"
   - `watchdog-stuck` → "No agent running"
   Fall back to a generic "Needs your input" only for an unknown reason.
3. **Animations only for real activity.** "reviewing", "coding", "running
   checks", "waiting for review" (only while a review is actually running or
   queued) may animate; a review-state task with no running review and no
   verdict must not show a working indicator.
4. **Task panel header follows the same rules**: replace NEEDS INPUT /
   AWAITING REVIEW with the same reason chip, and no "awaiting review" when no
   review is running. Keep the "Waiting for you" banner.
5. **Each banner's main action says it clears the flag**, e.g. "Restart work
   (clears this)", "Review again (clears this)", "Answer below (clears this)".
   Add suggestion text for every reason, including
   `check-failed-after-retries`.
6. **Secondary "Dismiss" on the banner** for when the human handled it another
   way. It clears `needs_input` / reason / detail and records an activity entry
   ("needs_input dismissed by <user>"). If no agent is running on an `active`
   task, the dismiss confirmation says clearing the flag won't restart work.

## Acceptance

- Tests: for each `needs_input_reason`, the card and panel show the reason
  label with the warning style and no animation.
- Test: a `review` task with no running review and no verdict shows no working
  indicator.
- Test: Dismiss clears the flag and writes the activity entry.

## Activity

- 2026-09-26T03:19:13Z · created · unknown
- 2026-09-26T03:21:04Z · review_model_override
- 2026-09-26T03:21:06Z · status inbox→ready
- 2026-09-26T03:21:08Z · status ready→active, branch
- 2026-09-26T04:18:46Z · agent exited with an error (cursor) · the agent process exited with an error — open the task to see the full output
- 2026-09-26T04:24:04Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-26T04:32:05Z · status active→review
