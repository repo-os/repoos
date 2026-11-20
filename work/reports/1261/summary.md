## TL;DR

A QA sweep of the Inbox and Review pages at 375, 768 and 1280 px found exactly one defect: empty status columns rendered a bare "—" instead of meaningful copy. The fix added a plain-English empty-state map covering all five non-draft status columns, plus the status-filter view, verified by a new headless WebKit width-walk test. One engineering round, one review pass (good to go), closed out successfully.

## Outcome

The task shipped a targeted fix to the empty-state copy of the board's status columns, which is where the Inbox and Review pages actually live (they are status columns on the Work page, not routes; on phones the Work page renders `MobileWorkQueue.vue` instead):

- `BoardColumn.vue` no longer defaults to "—" when no empty text is passed. A `PLAIN_EMPTY` map keyed by column id now provides plain-English copy for all five non-draft status columns (Inbox, Ready, Active, Review, Done — not just the two the task named), fixing the whole class of the problem.
- `WorkView.vue`'s status-filter column, which passed the dash explicitly, now only does so for `draft` — preserving the existing dash behavior that `board-column-labels.test.ts` asserts for draft, while the other statuses get real copy.
- A new test, `src/ui-app/tests/inbox-review-pages-qa-browser.test.ts` (+341 lines), mounts the real components, serializes the DOM into headless WebKit at 375 / 768 / 1280 px using the built global stylesheet, and at each width asserts: no element escapes the viewport, empty copy is words rather than a dash, the column header shows a visible keyboard focus ring on Tab, and the phone queue's loading, error and empty states fit.

The review's final verdict was **good to go** on the first pass, and the task closed out with a successful release (`release:success`, merged commit `3b4fc96ba7cf708c49a18447a3c20952b612fa54`).

## Process stats

- **Engineering rounds:** 1 (Round 1, completed 2026-11-20T02:14:16Z).
- **Review passes:** 1 (Pass 1, 2026-11-20T02:15:26Z, verdict "good to go"). No restarts or model swaps recorded; the review found no bugs.
- **Wall-clock, creation to done:** 2026-11-20T01:42:34Z → 2026-11-20T04:32:07Z, i.e. 2 h 49 min 33 s (difference of the two recorded timestamps). Most of that was close-out: the close-out gate alone ran 727 s, and the task sat in review from 02:14:17Z to done.
- **Agents and models:**
  - Engineer: agent `engineer`, model `haiku` (Claude Code harness per the round header), started 01:43:36Z, elapsed 1417 s, 371 tokens, $0.18604678.
  - Reviewer: agent `reviewer`, model `opencode-go/glm-5.3-flash` (OpenCode harness), started 02:14:19Z, elapsed 67 s, 43,942 tokens, $0.01665671.
  - Routing: Model router (jev), model recorded as unknown, elapsed 0 s, tokens and cost not recorded.
- **Recorded token total (engineer + reviewer):** 44,313 tokens; recorded cost total: $0.20270349 (sums of the per-session figures above; the routing session contributes no recorded values).

## What went wrong

- **Task created in `needs_input` twice.** At 01:42:36Z and again at 01:42:41Z the task flagged needs-input because its body was empty; it was resolved within seconds by filling in the Problem, Desired UX, Acceptance criteria and Notes sections, after which it moved to ready and then active at 01:43:00Z.
- **Wrong vitest config on the first test run.** Running the new browser test with the repo-root vitest failed to compile `.vue` files. Fixed by running it with `--config src/ui-app/vite.config.ts`. A config-location detail, not a code bug.
- **Draft-dash regression risk.** The engineer's first fix removed the explicit `empty-text="—"` from the status-filter column, which would have made the prop `""` and broken the existing draft assertion in `board-column-labels.test.ts`. Resolved with a conditional `draft ? "—" : undefined`, keeping the draft dash and fixing every other status.
- **Handoff gate held the task mid-flight.** A CTO nudge at 02:07:10Z recorded "held — handoff gate is running". The gate completed normally (UI verification passed at 02:14:15Z with 1 clean-console shot) and the task moved to review at 02:14:17Z. This was a wait, not a failure.
- **A queued message was never delivered and was dropped.** The handoff message queued at 02:14:17Z went undelivered for over an hour (overdue notice at 03:19:27Z), and was finally discarded at 04:29:41Z because the task was already done. It was bookkeeping, not a defect in the work; no action was needed.
- **Known coverage gaps, self-reported rather than fixed in-task:** the overflow and focus assertions were never exercised against a real layout failure (they passed on first run), and the full Work page was not walked at the three widths because it needs the API and auth shell, which a managed session cannot serve. The component-level audit covered the surfaces that actually differ by width.

## Learnings

- **Inbox and Review are not routes.** They are status columns (`COLUMNS` in `src/ui-app/src/stores/repo.ts`) rendered by `BoardColumn.vue`, with `MobileWorkQueue.vue` replacing them below the mobile breakpoint. Any future QA of "the Inbox/Review pages" should target those components, not a URL. This is a non-obvious architectural fact worth recording in the UI conventions doc (`docs/agent-ui-and-preview-conventions.md`).
- **A bare "—" empty state is the kind of defect a visual pass waves through** — it isn't broken, just unhelpful. Asserting that empty copy is words, not a dash, turned it into a failing test first. That testing pattern (assert the *quality* of placeholder copy, not just its presence) generalizes and could be noted alongside the existing QA test pattern referenced in the task (`work-board-moves-qa-browser.test.ts`).
- **When a fix names two instances, cover the whole class:** all five non-draft status columns shared the same `emptyText` fallback path, so the fix keyed a map by column id rather than special-casing Inbox and Review. Draft keeps its explicit dash because an existing test locks that behavior.
- **Reviewer-noted, unresolved:** the phone-queue test's silent `catch` around `scopedCss()` drops scoped styles without failing, which could quietly weaken the overflow assertion if the marker class is ever renamed. The reviewer suggested failing loudly or logging. No follow-up task was filed for this, so it lives only in the review record — a candidate for a small task if the test is touched again.

## Follow-ups

None — no linked tasks were recorded for this work. (The reviewer's suggestions above — loud failure for `scopedCss`, and optionally declaring a shot for `/work?status=review` to show the new empty copy — remain open ideas with no task filed.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
