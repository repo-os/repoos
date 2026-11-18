---
task: "1157"
pass: 5
at: "2026-11-17T20:49:35.730Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-use-the-repoos-web-app-on-deskto
state: ok
tree_identity: "b008a4537:b008a45379"
---
## Verdict
`needs some work` — Secrets' environment picker still overflows the 320 viewport, and the Work status filter still clips at 390; the QA report calls both clean.

## Relevance
`still relevant` — the four 320 fixes and the QA record are worth landing; no other task covers these phone-width regressions.

## Evidence
None

## Bugs
- **Class: narrow-width control clipping** — `src/ui-app/src/style.css:16972-16993`: `.secrets-env-control { justify-items: end }` plus `.secrets-picker { width: 220px }` in a label + 8px-gap row means at 320 the environment picker's right border and chevron sit beyond the viewport and cannot be reached (document `scrollWidth` is 320, so it does not scroll). Visible in `.repoos/qa/1157/secrets-320-{light,dark}.png`; the report marks Secrets clean and files only the 401 (#1164). At ≤760px let the row shrink/wrap (e.g. `justify-items: stretch; min-width: 0; width: min(220px, 100%)`) and assert it.
- **Class: narrow-width control clipping** — `src/ui-app/src/components/MobileWorkQueue.vue:721-728`: the new reflow only applies at ≤360px, so at the required 390px width the three-column row still line-clamps the status value to “Needs attent” (`round2-work-390-{light,dark}.png`). Extend the reflow to cover 390 or let the filter span the row there.

No further findings of this class were found after grepping: the four corrected 320 states (`MobileWorkQueue.vue`, `TaskDrawer.vue` quickbar, `InputsView.vue` byline + `detail-meta`, `.am-list-notice-text`), the 320 captures for control, inputs, work, drawer, stories, checks, releases, deployments, dev, agents, context Docs/Skills/Discover/History and settings tabs, and the intentional horizontal strips `.settings-tabs`, `.mobile-chip-row` and the Context tab strip (scrollable, not unreachable).

## Edge cases
- No current-round engineering report: round 1 is stale (`2dfde2c`) and says “I did not change app source”; the four source fixes and test are documented only in `docs/qa`.
- 390 post-fix state is unverified: the 390 Inputs/drawer captures predate the wrapping/quickbar fixes (`inputs-390-light.png` still shows the old broken byline), so the fixed 390 layouts have no screenshot.
- Handoff UI verification: the Work shot's declared `.page-title` was captured as `h1`, which matched nothing; the PNG itself renders `/work?view=board` correctly. This is an evidence defect, not a UI one.
- Console evidence recorded only the documented no-auth Secrets 401; acceptable for `serve-noauth`, tracked by #1164.
- The regression test greps source text, so it cannot catch the 390 computed-layout instance above.

## Suggestions
- Re-capture 390 Inputs and the drawer after the fixes, and regenerate the Work declared shot with `.page-title`.
- Prefer a computed-layout assertion at 320 and 390 over source-string regexes.

## Automated verification

- Browser console-error check (handoff evidence): **failed** — Handoff browser verification recorded 1 blocking issue(s): [missing-target] Work queue at desktop with mobile queue behavior evidenced in attachments (target "default"): highlight h1 matched nothing on /work?view=board
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

