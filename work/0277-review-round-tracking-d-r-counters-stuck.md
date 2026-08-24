---
id: "0277"
title: "Review round tracking: D#/R# counters stuck, review tab disappears in done state"
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/review-round-tracking-d-r-counters-stuck
created_at: "2026-08-24T15:57:39Z"
updated_at: "2026-08-24T17:55:55Z"
---
## Problem
Two related display bugs around review rounds.

**1. D#/R# counters never match the real number of dev/review rounds.**

The task's compact lifecycle badge (`D{{taskRounds.dev}} · R{{taskRounds.review}}`, rendered in `TaskDrawer.vue` ~2055–2060 from the `taskRounds` computed at ~682–695) reported at most `D2 · R2` (and later `D2 R1` in the done state) even though a task actually went through **3** separate reviewer sessions, each with its own dev + review pass. The tokens tab / individual sessions view showed the correct per-session history (3 sessions → should be `D3 · R3`), so the display path and the reality diverge.

Root-cause lead: `taskRounds` derives solely from the single `task.extra?.review_rounds` integer (frontmatter). The server's automated bounce path (`src/server/review.ts` `autoBounce`, ~818–946) increments `review_rounds` — but only for auto-bounced rounds and capped at `MAX_AUTO_REVIEW_ROUNDS`. Human-initiated review passes, `model_override` resets, and round-trips that don't go through `autoBounce` appear **not** to bump `extra.review_rounds`. Net effect: the badge undercounts relative to actual sessions. Confirm whether the counter should sum *actual reviewer sessions* rather than (or in addition to) the stored `review_rounds` bookkeeping.

**2. The review tab vanishes in done state.**

The "Review" tab button in `TaskDrawer.vue` (~2219–2233) is gated behind `v-if="ui.active.status === 'review' || ui.active.status === 'active'"`. Once a task reaches `done`, the tab disappears entirely, even though the review report / history (verdicts, per-round findings, reviewer conversation) is still relevant and useful after sign-off. It should stay visible across **all** statuses, not just active/review.

## Expected behaviour
- The `D# · R#` badge equals the true number of dev and review passes the task went through, consistent with what the tokens/sessions view shows — including after review passes that were not automated bounces (manual review, `model_override`, post-done).
- The Review tab remains available and shows the report/history for **every** status (inbox, ready, active, review, done), not just active/review.

## Fix / investigation checklist
- [ ] Locate the true source of truth for round counts (per-session reviewer data vs `extra.review_rounds`). Cross-check against the tokens tab, which was correct.
- [ ] Update `taskRounds` (and any equivalent on the task card if it renders its own badge) so the count reflects actual dev/review rounds in every state — incl. the `D2 R1` regression seen in done.
- [ ] Confirm the server writes `review_rounds` (or a richer round-history field) on every path that opens a new review pass — not just `autoBounce`. In particular the `model_override` and manual-review flows. If only some paths update the stored counter, either make them all update it or base the badge on session data directly.
- [ ] Remove / relax the `v-if` on the Review tab button so it renders for all statuses; ensure the review pane hydrates and renders safely when the status is `done` (e.g. `reviewSubstate`, `completedReviews` math, hydration guards in the agent-review tab).
- [ ] Check other consumers of `task.extra.review_rounds` / status-gated review visibility (auto-bounce max-rounds logic, `AgentReview.vue` / review hydration, any tests asserting the counter).

## Acceptance criteria
- A task that went through 3 dev+review passes shows `D3 · R3` on the badge — matching the tokens/sessions view — in active, review, **and** done states (not stale `D2 R2` / `D2 R1`).
- The Review tab is visible for a task in done state (and every other status) and shows the report/history without error.
- Auto-bounce's `MAX_AUTO_REVIEW_ROUNDS` cap still behaves as before (that logic is intentional).
- `repoos check` green; existing review-related tests updated/passing.

## Scope / out of scope
- In scope: counter correctness + tab visibility. UI + server touchpoints as needed to make the stored count reflect reality.
- Out of scope: changing the auto-bounce max-rounds policy, or the review verdict logic itself. Zero new runtime dependencies.

## Activity

- 2026-08-24T16:00:11Z · body
- 2026-08-24T16:45:21Z · model_override
- 2026-08-25T00:50:00Z · body — fleshed out by PM with root-cause leads, expected behaviour, investigation checklist, and acceptance criteria.
- 2026-08-24T17:40:47Z · body
- 2026-08-24T17:40:54Z · status inbox→ready
- 2026-08-24T17:49:49Z · status ready→active, branch
- 2026-08-24T17:55:53Z · model_override
