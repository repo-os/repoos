## TL;DR

Task #1151 fixed the Back control on the full-screen diff view, which measured 76×28 CSS px at mobile widths — under the app's 44×44 touch-target floor. Because `DiffView.vue` is shared by four routes (task diff, conflict diff, repo working diff, commit diff), one CSS change fixed all entry points: on phone widths and coarse pointers the button now floors at 44px, and the keyboard-only `esc` hint is hidden on the same breakpoint so the taller control frees horizontal room rather than costing any. A `:focus-visible` ring using the theme `--ring` token was added, plus regression tests covering the CSS rule and all four routes. Two review passes returned `good to go`; the only gaps were declared screenshots showing empty/loading states on the preview board, not code defects. Landed as `fdfe32798b993040a12acf288e30af008e66a274`.

## Outcome

Shipped, in one CSS-scoped change:

- **Back control touch target:** on `@media (max-width: 719.98px), (pointer: coarse)`, the Back button gets `min-width/min-height: 44px`, `display: inline-flex` and fills its toolbar row — modelled on the existing `.drawer-mobile-back` pattern from the task-detail drawer. Measured 79.66×44 at 390×844 and 320×844 in light and dark themes, on all four routes.
- **`esc` hint hidden on touch:** the keyboard-only hint beside the button is hidden at the same breakpoint, returning ~30px of toolbar width to the filename. Desktop is unchanged (75.7×28 with hint visible).
- **Focus visibility:** an explicit `:focus-visible` outline — 2px `var(--ring)` with 2px offset — replacing the browser default.
- **Tests:** a table-driven `it.each` mounting `DiffView` across all four routes asserting Back renders and calls `router.back()`, plus source-level assertions in the `mobile-touch-affordances` suite (extended to read `DiffView.vue`, since the rules are scoped to the SFC).

Changed files: `src/ui-app/src/views/DiffView.vue` (+20/−0), `src/ui-app/tests/diff-view-escape.test.ts` (+44/−2), `src/ui-app/tests/mobile-touch-affordances.test.ts` (+16/−0).

**Final verdict: `good to go`** on review pass 2, with the explicit qualifier EVIDENCE-GAP-ONLY — the declared task-diff shots captured loading/empty states because the preview board has no task 1151. Reviewers judged the implementation and tests sound regardless.

## Process stats

- **Wall clock, created → done:** 2026-11-17T03:32:44Z → 05:40:20Z (2h 7m 36s). Engineering start (04:00:15Z) → done: ~1h 40m.
- **Dev rounds:** 1 (single engineering round, no rework cycle after review).
- **Review passes:** 2, both `good to go` (pass 1 with evidence-gap qualifier, pass 2 confirming).
- **Agents and models:** engineer — `opencode-go/deepseek-v4.1-flash` (3766s, 238,256 tokens, $0.1559); reviewer — `opencode-go/deepseek-v4.1-flash` (265s, 59,825 tokens, $0.0182). One routing hop per role via the openrouter model router (0–1s each).
- **Restarts or swaps:** none recorded.
- **Totals where known:** 298,081 tokens, $0.174 across the two sessions. Other sessions/processes: not recorded.
- **Close-out gate:** completed in 628s; status `release:success`.

## What went wrong

- **Handoff UI verification failed (04:45:22Z), 3 issues.** The declared shots pointed at `/tasks/1151/diff`, but the managed preview board had no task 1151, so the task-scoped API returned HTTP 404 and the page sat on "Loading diff…". Resolved by re-declaring the shots against the repo-scoped commit route (`/repo/commits/3018ba22…`), which renders the same `DiffView` from `git show` and is dependable on a preview board. A CTO nudge at 04:44:35Z held the task while the handoff gate was running; the failure was queued and delivered as a message (04:45:24–28Z) and the engineer continued on the same round.
- **Declared shots still not re-captured by handoff (05:08:13Z):** `shots.json` still fingerprinted the old `/tasks/1151/diff` plan, and the automatic re-capture was skipped because three engineer-made captures already existed. Both review passes flagged this as the only gap — pass 2's verdict was `good to go` specifically as EVIDENCE-GAP-ONLY. The board's auto capture on the commit route supplied the positive evidence (44px button visible in populated light and dark captures). No 320px or conflict-diff capture was ever taken; resolution was reviewer acceptance of the gap, not a re-capture.
- **Headless measurement timing artefact during development:** the first measurement pass read the browser-default focus ring (`outline: solid 3px`, no offset) because the view's CSS is a lazy-loaded `DiffView-*.css` chunk, and the script measured after the selector existed but before the chunk applied. Not a cascade bug. Resolved by waiting for the lazy chunk; the computed style was then the intended `2px solid rgb(57,224,255)` with 2px offset.
- **Main checkout dirty at review time:** two untracked `.codex-attachments/*.png` files on main made the "Main clean" checklist item FAIL. Unrelated to the diff; resolved before close-out (release succeeded).
- **Focus ring clipped at top (noted, not fixed):** the 44px button sits 2px from the viewport top in the 48px topbar, so the outline's top 2px draws above y=0. Reviewers judged "focus remains visible" still holds (left/right/bottom visible). Not blocking; no task filed.

## Learnings

- **Task-scoped data is not dependable on a preview board** — declared shots should prefer repo-scoped routes (e.g. `/repo/commits/:sha`) that render the same component from real data. Candidate for `docs/agent-ui-and-preview-conventions.md`.
- **Measuring a lazy-loaded view in headless Chromium requires waiting for its CSS chunk, not just the DOM selector** — an early read silently shows browser-default styles and looks like a cascade bug. Candidate for the same doc (UI verification section).
- **The 44px mobile touch floor is enforced per-page, not globally**; copying `.drawer-mobile-back`'s shape is the cheapest way to stay consistent. Worth a line in `docs/agent-ui-and-preview-conventions.md`.
- **Removing a touch-irrelevant keyboard hint can pay for a larger control** — vertical growth without horizontal cost. A design pattern, not a rule; fine to leave here.
- **Scoped SFC styles need their own regression assertions** — the `mobile-touch-affordances` suite only read global CSS until extended to read the SFC. Durable test-convention note, candidate for `docs/`.
- **Route-shared components must be verified on every route, not just the primary one** — `it.each` over the route table is the contract.

## Follow-ups

None recorded. (Reviewer suggestions not filed as tasks: re-capturing the two commit-route shots plus a 320px and a conflict-diff capture; a 1px focus-ring offset to avoid the top clip; per-route rendered-content assertions in the `it.each` test.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
