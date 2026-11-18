---
task: "1170"
pass: 1
at: "2026-11-18T02:58:20.684Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-web-app-mobile-widths-375-768-ac
state: ok
tree_identity: "bd93cb464:b38727f75e"
---
## Verdict
`needs some work` — the dock now floats over the phone-reflow page at 720–760px, and the Settings strip stays clipped just above 900px.

## Relevance
`still relevant` — #1157 covered 320/390 only; 375/768 and the 60px-rail band still need this pass.

## Evidence
Handoff captured one auto shot: `/` at desktop width. It shows none of the surfaces this task fixes (Settings strip, rail switcher, Work dock at 375/768). Not marked EVIDENCE-GAP-ONLY because code defects are also present. The engineer's `.repoos/qa/1170/` shots are gitignored and absent from the diff; the matrix PNGs there are pre-fix (they still show the clipped rail chips and wrapped toggles).

## Bugs
- **Class: breakpoint band mismatch** — `src/ui-app/src/style.css:14896`: moving the dock from `min-width: 761px` to `720px` crosses a layout-mode boundary. At 720–760px `.work-page` is phone reflow (`display:block`, `overflow-y:auto`, stacked column at `max-width:760px`), so the fixed toggle row and fixed 84px `.work-page::after` fade now overlay the scrolling board and cover cards mid-scroll. Verified in WebKit at 740px: `display:block`, `position:fixed`, fade 84px. That band includes the 740×360 landscape phone #1139 supports, and was in normal flow before. Keep the dock at 761px; 768 needed only the tablet override.
- **Class: breakpoint band mismatch** — `src/ui-app/src/style.css:10471`: the scroller stops at 900px, but at 901px the 210px sidebar leaves the strip 639px, narrower than the 656px it gets at 768px. Measured with Sora loaded, the seven tabs are 695px, so the last tab stays clipped at 901–957px — immediately past the new boundary.
- **Class: breakpoint band mismatch** — `src/ui-app/src/style.css:14908`: the dock's `100vw − 756px` leaves 145px at 901px and 244px at 1000px, so toggles wrap and cover Active again around 901–1090px. Logged as a follow-up, but it is the same root cause.

No further findings of this class were found after grepping: `.parked-lists` rules, `.ibar`/`.ibar-wrap` queries, `.settings-tabs` rules, `.work-page` reflow query, `.sidebar` 720/900 query.

## Edge cases
- `bottom: 66px` assumes the pill is ≤52px; an expanded `.ibar` grows upward from `bottom:14px` and can collide with the toggles. The test renders only the idle pill.
- Settings and Releases content never loaded (401s), so those fixed states stay unverified.

## Suggestions
- Add a 740px case to the new test; its fixture pins `height:800px` inline, which hides the phone reflow.
- Commit or inline `measure.mjs`; the doc's reproduce command points at a gitignored, unshipped file.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-18T02:50:38.505Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

