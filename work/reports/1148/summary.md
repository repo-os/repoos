## TL;DR

Task #1148 reduced the repeated navigation density of the mobile Settings page (390px): the six/seven-item page grid became a single horizontally scrollable tab rail, and the long wrapping row of General topic chips collapsed behind one compact "Sections" disclosure that names the active section. Desktop composition is unchanged. One engineering round plus a post-review fix pass, two review passes, and a bumpy handoff (a failed remote validation, a watchdog restart, a pressure hold, a cancelled shot capture and an overdue message) ended in review pass 2 "good to go", close-out gate success and merge as commit `34c5a20981a431b3ee4d94389b89384447a1868a`.

## Outcome

Shipped: at narrow viewports the mobile page navigation is one flex row with `overflow-x: auto` (44px pills, scroll-snap, active pill scrolled into view on deep links such as `/settings?tab=notifications`), replacing the previous two-column grid from #1115. The fourteen General section chips now sit behind a single "Sections" disclosure button that shows the active section name (or "Browse all" when no `?section=` is set), expands into the same chips via `v-show` on a shared `<nav>` (single-sourced from `GENERAL_SECTIONS`), is bounded to `min(46vh, 360px)` with its own scroll, closes on selection/tab switch/Escape/outside tap, and restores focus to the trigger. Desktop (1440px) tab strip and chip row are untouched. A new test file `src/ui-app/tests/settings-mobile-nav-density.test.ts` covers collapsed/open states, selection, Escape, focus restoration and desktop preservation.

Diff: `src/ui-app/src/style.css` (+84/−12), `src/ui-app/src/views/SettingsView.vue` (+110/−2), new test file (+191).

Final verdict: review pass 2 "good to go" (2026-11-17T06:07:53Z); task closed as `done, release:success` at 2026-11-17T07:21:07Z.

## Process stats

- **Wall clock:** created 2026-11-17T03:06:33Z → done 2026-11-17T07:21:07Z, i.e. 4h 14m 34s.
- **Engineering rounds:** 1 recorded round (round-1 report 2026-11-17T04:44:31Z). The fixes after review pass 1 landed without a round-2 report (review pass 2 explicitly notes this).
- **Review passes:** 2 — pass 1 "needs some work" (04:50:30Z), pass 2 "good to go" (06:07:53Z).
- **Agents/models (from the sessions table):**
  - Engineer ×1: `opencode-go/deepseek-v4.1-flash`, started 03:46:44Z, elapsed 6380s (1h 46m 20s), 317,280 tokens, cost 0.16710549, finished. (The watchdog logged an engineer restart at 05:54:22Z, but only one engineer session is recorded.)
  - Reviewer ×2: same model — pass 1: 345s, 69,989 tokens, cost 0.02497233; pass 2: 213s, 56,538 tokens, cost 0.01709145; both finished.
  - Routing: 3 Model-router (openrouter) sessions, model "unknown", 1s/1s/2s, tokens and cost unrecorded.
- **Totals:** 443,807 tokens and 0.20916927 cost across the three recorded engineer/reviewer sessions (routing excluded). No model swaps recorded.
- **Verification:** engineer's `bun run test --changed main` — 17 files, 212 tests, passed (the managed check's test step was skipped via `REPOOS_SKIP_TESTS=1` on the remote-validation path). `REPOOS_CHECK_CHANGED=main repoos check` passed format, lint, build, CSS layering, theme contrast, hard-coded colors, the rendered contrast audit (16 theme scopes), bare-require and branch-artifact guards, and UI smoke. Close-out gate completed in 355s.

## What went wrong

- **Review pass 1 — focus rings clipped:** both new scroll containers (`.settings-mobile-nav`, `.settings-section-nav--phone`) clipped the keyboard focus rings of every phone pill and chip, contradicting the acceptance criterion on keyboard usability. Also flagged: 40px chips below the 44px house rule from #1139, a `scrollIntoView` on `isNarrow` flip that could snap the page, no outside-tap dismissal, and a missing rail scroll affordance. Resolved in the fix pass: `outline-offset: -2px` in both containers, 44px chips, reveal without `scrollIntoView`, outside-tap dismissal and scroll-snap added — verified by review pass 2.
- **Pressure hold:** CTO nudge at 05:25:31Z — task held because the machine was under pressure (27.6× per CPU vs. limit 3×). Resolved by waiting for headroom.
- **Handoff failure 1 (05:51:19Z):** remote validation failed on `tests/agent-review.test.ts` ("flags needs_input instead of parking silently once auto-bounce rounds are used up"), with the instruction to fix it on the feature branch. Fixed; work continued on the branch.
- **Watchdog restart (05:54:22Z):** a queued message had waited 3 minutes with no live engineer process; the watchdog restarted the engineer and the message was delivered a second later.
- **Handoff failure 2 (06:05:53Z):** shots capture failed ("browser capture cancelled") and the handoff errored — "could not auto-retry after check failure · This worktree already has a recorded live engineer for task #review:1148 (pid 1911)". The `active→review` transition itself had succeeded at 06:04:09Z and review pass 2 completed at 06:07:53Z, so the task proceeded.
- **Overdue message (07:15:18Z):** the 06:05:50Z queued message sat undelivered past 60 minutes. Close-out proceeded anyway; the gate completed at 07:20:40Z.
- **Stale artifacts at reviewed HEAD:** review pass 2 judged stale round-1 captures (tree `3f6ad3daa0`, one commit behind reviewed HEAD `f2292fd78`) plus the diff — the phone shots still showed 40px chips and the pre-snap rail, and no round-2 report exists. Not recorded whether the shots were re-captured before sign-off.

## Learnings

- **Density comes from stacking two complete lists, not from either list being too big.** Collapsing one layer into a disclosure fixed the first-viewport problem while keeping every topic one tap away. (Candidate for `docs/agent-ui-and-preview-conventions.md` as a mobile-composition pattern.)
- **Focus indicators inside scroll containers must use negative `outline-offset`.** The repo already had the fix for `.settings-tab-btn`; the new rail and section panel regressed it anyway. Worth a line in `docs/agent-ui-and-preview-conventions.md`, and review pass 1's suggestion of a small CSS test asserting `outline-offset` inside scrolling settings containers would guard the class against regressions.
- **Scrollable rails must bring the active item into view on deep links**, or URL-driven selection is only correct after a manual swipe.
- **Mobile-only changes need `viewportWidth`/`viewportHeight` in declared shots**, otherwise automated captures show the unchanged desktop composition.
- **A fix pass without a round-2 report leaves the reviewer judging a stale report and stale captures.** The reviewed tree and the last report's tree diverged; the reviewer had to fall back to diff-only judgement for round-2 work. Worth encoding in `docs/agent-workflow-rules.md` or the review conventions doc.

## Follow-ups

None. (No tasks were linked or filed per the recorded Linked tasks. Review pass 2 left open suggestions that were not turned into tasks: re-capture the three declared shots on the reviewed HEAD, optionally focus the first chip on open, a rail-edge fade affordance, and a CSS test for `outline-offset` in scrolling containers.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
