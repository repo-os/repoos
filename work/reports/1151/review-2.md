---
task: "1151"
pass: 2
at: "2026-11-17T05:12:47.545Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/full-screen-diff-pages-make-the-back-con
state: ok
tree_identity: "9462e4545:acf1e9c268"
---
## Relevance
`still relevant` — main still renders the 28px Back chip; nothing landed covers it (#1139 never touched DiffView, and #1146 changes only `style.css`/docs, so there is no overlap to discard this for).

## Evidence
- `Task diff at 390px: Back is a 44px touch target (dark)` — `/tasks/1151/diff` renders "Loading diff…" (preview board has no task 1151; the declared route is now `/repo/commits/3018ba22…`), so it is not the declared capture.
- `Task diff at 390px: Back is a 44px touch target (light)` — same loading state/route problem.
- The declared commit-route shots were never captured: `shots.json` still fingerprints the old `/tasks/1151/diff` plan, and the handoff note skipped re-capture.
- No 320×844 capture exists in either theme (the engineer claims a headless measurement only).
- Usable positive evidence: auto `default-3.png` (populated commit diff, light) measures the button at rows 2–45 = 44px, and the dark loading capture also shows a 44px box.

## Bugs
None found

No further findings of this class were found after grepping: `DiffView.vue` topbar/back rules and all four loaders, the `.drawer-mobile-back` precedent and its breakpoint, `diff-view-escape.test.ts`, `mobile-touch-affordances.test.ts`, the four `fullscreen: true` router entries, and `:focus-visible`/`--ring` theme definitions.

## Edge cases
- The focus ring's top edge is clipped: the 44px button sits 2px from the viewport top in the 48px topbar, so `outline-offset: 2px` draws the top 2px entirely above y=0. Left/right/bottom remain visible, so "focus remains visible" still holds.
- `(pointer: coarse)` also fires on touch laptops with a keyboard, where hiding the `esc` hint removes a still-useful affordance (matching #1139's precedent).
- Filename/delta/status chips still fit at 320px because the hint frees ~30px; desktop is unchanged.

## Suggestions
- Re-declare/re-capture the two commit-route shots (dark and light) plus one 320px shot so the drawer shows the accepted evidence; delete the loading-state captures from the evidence set.
- The `it.each` route test only asserts the unconditional Back button, so it would pass if a route's diff loading were broken; assert per-route rendered content too.

## Could not verify (environment)
- Landing checklist "Main clean: FAIL" — two untracked `.codex-attachments/*.png` files on main; unrelated to this diff but must be committed/stashed before Move to done.

## Verdict
`good to go` — implementation and tests are sound; only the declared handoff captures are missing/wrong. EVIDENCE-GAP-ONLY

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

