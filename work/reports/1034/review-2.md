---
task: 1034
pass: 2
at: "2026-11-04T17:29:05.294Z"
agent: reviewer
cli: opencode
model: opencode-go/muse-spark-1.3-contributor
branch: feat/stuck-needs-input-detail-text-clamp-to-2
state: ok
tree_identity: "6918723fa:6b61b2858"
---
## Verdict
`needs some work` — the card capture proves the new clamp does not truncate: full 7-line detail, tall card, no ellipsis.

## Relevance
`still relevant` — long check-wait diagnostics still bloat cards and the panel; nothing else has fixed it.

## Evidence
None

## Bugs
- **Class: line-clamp placed directly on a native `<button>`.** `TaskCard.vue` renders the detail as `button.tc-needs-detail--clamp` (`display: -webkit-box; -webkit-line-clamp: 3`), but `default-1.png` shows the entire ~260-char message over ~7 lines with no ellipsis and the trailing `Details` span visible. That span sits after the text in DOM, so its visibility proves content exceeds 3 lines — the clamp is not truncating and the card stays tall, the exact complaint in the spec. Same latent pattern in `TaskDrawer.vue` (`button.agent-waiting-detail--action` + `--clamp`): it only looks right because the full string happens to fit ~3 lines at drawer width; it will fail the same way on narrow viewports. The pre-existing working clamp (`tc-hint--progress-clamp`) sits on a `span[role=button]`, not a button. Fix both by moving the clamp declarations onto an inner `<span>` and leaving the outer `<button>` unclamped (keep `@click`, focus ring, and the `Details` affordance outside the clamped span so it is never clipped).

## Edge cases
- `needsInputDetailUsesLineClamp` now returns true for every visible detail (short 1-line details get a harmless no-op clamp class) — by design, fine.
- `onCardHintClick` reroutes `tc-queued` hints to Status details instead of the old fall-through; sensible but uncovered by a test — worth one line asserting it.
- The drawer `aria-label` embeds the entire long message; verbose for screen readers but correct.
- The new "Check slot wait" Debug row duplicates the detail text when both queue markers and `needsInputDetail` exist; intentional per the report, acceptable.
- No new bare `node`/`npm`/`npx` invocations; new CSS uses only `var(--txt-dim)`/`var(--ring)`; no native `title` tooltip on the new buttons.

## Suggestions
- After the inner-span fix, re-capture the card shot and confirm ≤3 lines with ellipsis, `Details` visible, and `Restart work` still below the fold of the clamp.
- Drop the redundant `@keydown.enter/space` handlers on the pre-existing `drawer-status-summary` button (`TaskDrawer.vue:5738-5739`): native buttons already fire `click`, so Enter invokes `openStatusDetails` twice (idempotent today, but the same trap pass 1 flagged).
- Add standard `line-clamp` alongside `-webkit-line-clamp` in the new rules for future-proofing.

## Handoff UI verification (recorded at handoff)
2 captures from tree `6b61b2858` (current modulo bookkeeping, so current): `default-1.png` (board) shows the fixture card with the full unclamped message — the defect above, not a capture error; card route/fixture fixed since pass 1. `default-2.png` (drawer `/work?task=9999`) shows the WAITING block with full text fitting ~3 lines, `Details` affordance, and primary actions visible. Zero console errors recorded at capture time.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-04T17:26:36.369Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

