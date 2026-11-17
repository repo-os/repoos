---
task: "1149"
pass: 1
at: "2026-11-17T11:16:51.275Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/checks-mobile-header-make-overview-and-p
state: ok
tree_identity: "c6981a153:6989120bae"
---
## Verdict
`needs some work` — EVIDENCE-GAP-ONLY: both captures are desktop 1024×768, so the 390/320px criteria are unverified.

## Relevance
`still relevant` — on main the Check actions still sit in a narrow right column; #1145 hid the subtitle on phones but supplies no concise purpose line, which this change adds.

## Evidence
- `Checks overview on mobile` (`/checks?tab=runs`) — PNG is a 1024×768 desktop view; the ≤719.98px rules never fire. The declared shot carries no `viewportWidth`/`viewportHeight` (see `planFingerprint` in `.repoos/ui-verification/1149.json`), so the stacked header, mobile copy and two-column action row are not shown.
- `Checks history on mobile` (`?shotState=checks%3Atimings`) — fixture renders (1 run, timings table) but again at desktop width, not a phone layout.
- No dark-theme capture, although the task's Notes for AI require light and dark inspection.
Route matching, the `checks:timings` fixture and the zero-console-error log are all valid; only the viewport/theme coverage is missing. Report source `6989120bae` matches HEAD `c6981a1` apart from bookkeeping.

## Bugs
None found

No further findings of this class were found after grepping: `ChecksView.vue` header template, `.ck-head`/`.ck-actions`/`.ck-help-link`/`.ck-sub` rules, the shared `@media (max-width: 719.98px)` `.ck-sub` hide in `style.css` (#1145), `.agent-tabs` mobile wrap (≤900px, 44px tabs), other `.ck-help-link` users, and `shot-plan.ts` viewport support.

## Edge cases
- Plan tab has a third action: Refresh lands alone in one column of the 2-column grid, and as a `size="sm"` ghost button it is ~28px tall — below the 42px the links get.
- Scoped `display: block` on `.ck-sub` re-shows the line for Checks only; other pages keep #1145's hide (verified specificity: scoped `[data-v-*]` beats the global rule).
- Desktop capture confirms the 720px+ branch is unchanged; the 720–900px band still uses the row layout, which is intended.

## Suggestions
- Re-capture with `viewportWidth: 390, viewportHeight: 844` (plus 320) and once in dark theme.
- Use 44px minimum height to match the repo's mobile convention (#1139) rather than 42px.
- On the plan tab, let Refresh span both grid columns so it isn't a half-width orphan.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T11:15:20.464Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

