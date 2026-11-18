---
task: "1157"
pass: 6
at: "2026-11-17T21:50:00.356Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-use-the-repoos-web-app-on-deskto
state: ok
tree_identity: "e325abd46:b008a45379"
---
## Verdict
`needs some work` — the drawer's Review and Debug control rows still clip at phone widths; two attached captures show it and the QA report misses both.

## Relevance
`still relevant` — the Work/Inputs/Agents/Secrets narrow-width fixes and the QA record are worth landing; no other task covers these phone-width regressions.

## Evidence
None

## Bugs
- **Class: narrow-width control clipping** — `src/ui-app/src/style.css:7232` `.review-toolbar` is a non-wrapping flex row (`justify-content: space-between`). At 390 its third child, the "Send engineer" button, runs past the viewport edge and its label is cut to "Send engin" in `att_bb2db198` and `att_6073a805` (round-3 Review tab); at 320 it overflows further. Fix: let the row wrap at phone widths (like `.quickbar-row`) and assert it.
- **Class: narrow-width control clipping** — `src/ui-app/src/components/DebugPanel.vue:957` `.debug-tabs` is a non-wrapping flex strip with no `overflow-x`. At 320 the fourth pill, "Merge conflict", is cut by the right edge with no scroll affordance, in `att_c3ad8b69`; at 390 the four pills also exceed the drawer width. Fix: wrap the strip at phone widths and assert it.
- **Class: verification overclaim** — `docs/qa/2026-11-web-qa-pass.md` states the drawer's Review and Debug tabs were verified at 320/390 and that the matrix "showed no horizontal overflow or reproducible layout defect"; its own attached Review (390) and Debug (320) captures show both clipped rows, and neither appears in the findings table.

No further findings of this class were found after grepping: `.review-toolbar`, `.debug-tabs`, `.changes-tabs`, `.drawer-tabs` (wraps), `.quickbar-row` (wraps), `.mobile-queue-row`, `.mobile-chip-row`/`.settings-tabs`/Context strip (intentional horizontal scroll), and the 320/390 Work, Inputs, Agents and Secrets captures.

## Edge cases
- No current-round engineering report: round 1 is stale (`2dfde2c`; HEAD `e325abd46`) and says "I did not change app source", so it does not describe this diff.
- Handoff UI verification is stale (`b008a45379` vs `e325abd46`) and its Work shot declared `h1`, which matches nothing (`WorkView.vue` uses `div.page-title`); re-verify on the final tree.
- `.repoos/ui-verification/1157.json` records no console log, so the "only console error was the Secrets 401" claim is not independently recorded.
- Earlier findings (Work 320/390, drawer status, Inputs byline, Agents notice, Secrets picker) are verified fixed by the round-3 captures.
- The new test's source-regex assertions plus synthetic WebKit geometry cannot catch unlisted rows like the two above.

## Suggestions
- Wrap both toolbars and add 320/390 computed-geometry assertions beside the existing ones.
- Remove the unused `agents` read at `mobile-responsive-overflow.test.ts:11`.
- Re-capture the three declared shots on the final tree with `.page-title`.

## Automated verification

- Browser console-error check (handoff evidence): **failed** — Handoff browser verification recorded 1 blocking issue(s): [missing-target] Work queue at desktop with mobile queue behavior evidenced in attachments (target "default"): highlight h1 matched nothing on /work?view=board
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

