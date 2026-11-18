---
id: review-2
title: review-2
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/qa-pass-web-app-mobile-widths-375-768-ac
task: "1170"
pass: 2
at: "2026-11-18T03:14:13.660Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
state: ok
tree_identity: "ee3de8270:ee3de82706"
---
## Verdict
`needs some work` — the dock fix stops at 1100px, but the toggle row needs 378px and still wraps (two lines over the pill) at 1101–1133px.

## Relevance
`still relevant` — #1157 covered 320/390 phone widths; the 768/rail band and these three surfaces still need this pass.

## Evidence
None

## Bugs
- **Class: breakpoint band mismatch** — `src/ui-app/src/style.css:14952`: the new `min-width:761px and max-width:1100px` lift leaves the wide rule (`width: min(640px, calc(100vw - 756px))`) in force from 1101px. Measured in WebKit against the real CSS and markup (chevrons/icons included), the row needs 378px, so the wide rule gives 345px at 1101 and 364px at 1120: "Archived (9)" wraps to a second line (`rowH` 72) whose bottom sits at y=786 on the pill's row (pill bottom:14, top ≈754, z-index 60 over the dock's 55). That is the same class pass 1 flagged ("around 901–1090px"); the fix simply ends ~33px short. Extend the lifted band to ~1140px (or reserve the row's real width instead of 520px) and add 1101/1120 to the dock `it.each` (currently only 768/900/1000), so the neighbouring-width check catches the boundary in future.
Pass-1 findings verified fixed: dock base back to 761px (740px case stays in flow), Settings scroller to 960px, 740px regression case added, measurement script committed with a Bun shebang and `bun …` reproduce command (no bare node/npm/npx in the diff).
No further findings of this class were found after grepping: `.parked-lists`/`.work-page::after` rules, phone-reflow query at 760px, `.sidebar` 720/900 query and its hidden children (`.theme-switch`, `.build-widget`, `.side-foot`), `.settings-tabs` rules, sibling tab strips (`.agent-tabs` wraps ≤900, `.ctx-tabs`), and the `--page-bottom-inset` clearance.

## Edge cases
- Expanded/violent integration pill (documented open risk): `bottom: 66px` assumes the bar's top stays above the row; an expanded pill reaches the toggles.
- At 961–1000px the un-scrolled Settings strip has only ~4px slack (699px available vs ~695px tabs with Sora); a wider font fallback clips the last tab again.
- Settings/Releases content stayed on skeletons (401s in the auth-less session), so those fixed panels are unverified by inspection — an evidence limit, not new.

## Suggestions
- The handoff capture is `/` at desktop width and shows none of the changed surfaces (Work dock, Settings strip, rail). A 768px shot of Work and Settings would let the human see the fix; the code defect above is separate.
- Keep the QA doc's "761–1100px fixed" claim aligned with the final band once the bug above is fixed.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-18T03:08:03.753Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

