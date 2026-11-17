---
id: summary
title: summary
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: ""
---
## TL;DR

Task #1147 fixed mobile task detail usability at 390×844 and 320px: the seven-tab drawer strip now wraps onto multiple rows instead of scrolling trailing tabs off-screen, and the preview-target helper copy gets its own full-width line (capped at 52ch) instead of being squeezed to one or two words beside the target selector. The fix is CSS-only inside the existing sub-720px media query, so desktop behaviour is unchanged. One engineering round, one review pass (`good to go`), and the task landed cleanly after one retry of the UI shot verification. Wall-clock from creation to done: 4h 8m 10s; total recorded LLM spend: $0.06441207 across 176,181 tokens.

## Outcome

Shipped, in plain English:

- **Task detail tabs on phones.** Below 720px, `.drawer-tabs-scroll` now uses `flex-wrap: wrap` with `overflow-x: visible`, so all seven tabs and the expand control are visible and tappable — two rows at 390px, three at 320px — replacing the #1137 horizontal-scroll presentation that left right-hand tabs off-screen with no affordance. The 44px touch-target floor and `white-space: nowrap` labels are preserved; the fullscreen control stays at the right edge of the last row.
- **Preview helper readability.** `.quickbar-row > .preview-hint` takes `flex: 1 1 100%` with `max-width: 52ch` inside the phone query, overriding the generic `> :first-child { flex: 1 }` rule that had compressed the helper to a word or two per line. Both helper paragraphs (target guidance and the platform note) get the treatment; the note was kept rather than deleted because it carries real remote-runner information.
- **Scope respected.** Header title/close-control alignment and Mission Control heading alignment stayed untouched, per the task's exclusion in favour of #1145. A stale comment in `TaskDrawer.vue` describing the strip as horizontal scrolling was updated.

Files changed: `src/ui-app/src/components/TaskDrawer.vue` (+4/−3), `src/ui-app/src/style.css` (+17/−0), `src/ui-app/tests/mobile-task-detail-entry-points.test.ts` (+16/−0). Merged commit `a9b658ac5e3f62f81ddc8e97942468e1d42d1c3a`.

**Final verdict:** review pass 1 returned `good to go`; close-out completed (`release:success`) and the task is `done`.

## Process stats

- **Dev rounds:** 1 engineering round (opencode runner).
- **Review rounds:** 1 pass, verdict `good to go`, no re-work requested.
- **Wall-clock, created → done:** 2026-11-17T03:06:27Z → 2026-11-17T07:14:37Z = 4h 8m 10s. Most of that was pre-dispatch time in `inbox`/`needs_input` (dispatch happened at 05:14:16Z; active → review at 05:49:35Z, ≈35 minutes of active engineering).
- **Agents and models per role:**
- Engineer: `opencode-go/deepseek-v4.1-flash` — session elapsed 1697s, 109,170 tokens, cost $0.041326974.
- Reviewer: `opencode-go/deepseek-v4.1-flash` — session elapsed 223s, 67,011 tokens, cost $0.023085096.
- Routing (Model router, openrouter): two 1s sessions; model listed as `unknown`; tokens and cost not recorded.
- **Combined recorded totals:** 176,181 tokens, $0.06441207 (routing sessions excluded — figures not recorded for them).
- **Restarts or model swaps:** none recorded.
- **Close-out gate:** completed in 212s.

## What went wrong

- **UI shot verification failed once (05:37:43Z).** The 320px shot on `/work?task=9999&tab=changes` caught a loading state ("Loading full diff… this may take a momen…") instead of the settled drawer. A message was queued and delivered to the engineer, body/steps were adjusted (activity shows body edits at 05:37:54–05:46:25Z), and verification passed at 05:49:34Z with 2 of 2 shots captured and a clean console. Resolved by retry; no lasting change.
- **Queued message went stale (06:52:21Z).** A queued message was flagged `message_overdue` — still undelivered 60 minutes after queueing. Its explicit resolution is not recorded; the task proceeded normally to close-out afterwards.
- **Scoped check skipped the test suite.** The scoped `repoos check` reported the full suite as skipped because the environment marked it as already running on the remote validation runner. The engineer compensated by running the affected UI test file locally and relied on the scoped check for build, CSS layering, theme contrast and the smoke test.
- **Handoff gate briefly held the task.** A CTO nudge at 05:34:57Z recorded the task as held while the handoff gate was running; it proceeded to review once verification passed.
- **Tooling worked against the wrong checkout once.** The engineer's first repository-wide grep resolved against the main checkout rather than the task worktree; resolved by switching to absolute worktree paths for all subsequent reads and edits.
- **Direct `bunx vitest run` failed** for UI tests because the Vue SFC plugin is only wired through the UI app's Vite config; the wrapper `bun run test <file>` worked and was used instead.
- **Pre-launch `needs_input` periods.** The task sat in `needs_input` from creation (03:06:30Z) until the body was fleshed out, and again at 05:14:03Z just before dispatch. These were human-side body/title finalisation, not failures.

## Learnings

- **"Reachable" is a stronger bar than "discoverable" — and than scrollability.** Horizontal scrolling technically made every tab reachable but left trailing destinations off-screen with no affordance. For a small, fixed set of tabs, wrapping is the better phone pattern; a scroll hint or "More" menu improves affordance without meeting the bar. Worth a line in `docs/agent-ui-and-preview-conventions.md` as mobile-tab guidance.
- **Fix a squeezed flex child on that child's selector, not the row.** The generic `> :first-child { flex: 1 }` rule caused the one-word helper lines; a higher-specificity rule on `.preview-hint` overrode it without disturbing the running-preview row. A reusable CSS pattern worth capturing in the UI conventions doc.
- **Layout CSS can be validated without a preview server** by rendering representative markup against the real `style.css` in headless Chromium at the target viewports and both themes. This keeps preview ownership with the human while producing hard measurements for acceptance criteria. Candidate for `docs/agent-ui-and-preview-conventions.md`.
- **Scoped-check test-suite skips need local compensation.** When the scoped check reports the suite skipped due to a concurrent remote run, run the affected test files locally rather than accepting the skip (consistent with existing "is it a flake or a real bug" guidance in `docs/debugging-check-failures.md`).
- **Guard tests should anchor on the *last* phone media query, not the first.** The reviewer flagged that the two new CSS guards use `[\s\S]*?` from the file's first `max-width: 719.98px` block (line 432), so they would still pass if the rule were moved to global scope — exactly the "desktop preserved" regression they exist to catch. `story-panel.test.ts:781` slices from the last phone block instead. Not fixed on this branch; a candidate for the Easter-eggs bundle process.
- **Pre-existing issues noted, not fixed here:** (a) at 390px dark, the quickbar status select truncates to "Re" when Stop work / Move to done share its row; (b) `isNarrow` (`<720`) vs the CSS breakpoint (`≤719.98`) differ by 0.02px at fractional widths. Both pre-date this diff; no tasks were filed for them.

## Follow-ups

None — no linked tasks recorded. (The reviewer's two suggested candidates — hardening the phone-block guard tests, and a task for the pre-existing 390px status-select truncation — were noted in review but no tasks were filed from this task.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
