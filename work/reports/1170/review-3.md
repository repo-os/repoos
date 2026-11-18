---
id: review-3
title: review-3
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/qa-pass-web-app-mobile-widths-375-768-ac
task: "1170"
pass: 3
at: "2026-11-18T03:38:14.449Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
state: ok
tree_identity: "d7fba27f7:d7fba27f72"
---
## Verdict
`needs some work` — the dock lift stops at 1140px, but the centred pill still covers the last parked toggle from 1141px to ~1384px.

## Relevance
`still relevant` — #1157 covered 320/390; the 768/rail band and these three surfaces still need this pass.

## Evidence
None

## Bugs
- **Class: breakpoint band mismatch** — `src/ui-app/src/style.css:14955`: the lift ends at 1140px, so from 1141px the dock returns to `bottom:14px` and the "Archived (9)" chip (x 470–592) is covered by the collapsed integration strip (174–200px wide, centred): strip x 471–671 at 1141, 500–700 at 1200, 550–750 at 1300, 580–780 at 1360; it only clears at 1440. Measured in WebKit with the real CSS and the branch's own toggle markup: overlap width 121px at 1141, 92px at 1200, 42px at 1300, 12px at 1360. The 520px reservation in the wide rule assumes a pill pinned to the right edge, but the desktop bar has been centred (`left:50%; transform:translateX(-50%)`, IntegrationStatusBar.vue) since #0224. This is the other side of the boundary pass 2 flagged; the `it.each` stops at 1140 and never renders `.ibar-strip`, so no case catches it. Extend the lifted band to ~1390px, or reserve the centred pill's real box. (Pass-2 findings verified fixed: dock base 761, Settings scroller 1000, `.sidebar`-scoped rail hide.)
No further findings of this class were found after grepping: `.parked-lists`/`.work-page::after` rules at 14839–14990, `.settings-tabs`/`.settings-tab-btn` rules and the phone `display:none` block, the 720–900 `.sidebar` query and its hidden children plus the later base rules at 13658/13785, the 760px reflow query, `.ibar`/`.ibar-wrap` phone and desktop queries, and all 15 test cases (0 fail on HEAD, 13 fail on main's CSS).

## Edge cases
- Expanded bar at 761–1140 still covers the row: 113px tall at 768 (bar top 673 vs row 703–734) and 73px at 1000/1140 (21px overlap). Documented, but the test's `.ibar` is a 39px bare span, so the assertion can't see it.
- The reviewed tree differs from the round-2 report's source tree (dock 1100→1140, Settings 960→1000, tests/doc updated) — no current-round report; I verified the final values directly.
- Settings strip at 1001–1010 has ~44px slack; a wider font fallback could clip again.

## Suggestions
- Add 1141/1200/1360 cases asserting the toggles don't intersect the real `.ibar-strip`, and render the real strip/expanded markup in the dock test.
- The handoff capture is `/` at 1280 and shows none of the changed surfaces; declare 768 Work and 768 Settings shots.
- "Four of the fifteen fail on the original CSS" is true only against the pre-round-2 tree; against main 13 of 15 fail.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-18T03:21:02.938Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

