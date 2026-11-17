---
task: "1151"
pass: 1
at: "2026-11-17T05:12:09.549Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/full-screen-diff-pages-make-the-back-con
state: ok
tree_identity: "9462e4545:"
---
## Verdict
`good to go` — EVIDENCE-GAP-ONLY: two declared task-diff captures show empty states; the CSS and the 44px control are sound.

## Relevance
`still relevant` — main's shared `DiffView` still ships the 28×76 chip, and #1146 only surveyed the route; nothing has landed a fix.

## Evidence
- Declared "Task diff at 390px … (dark)" (`default-1.png-1.png`, `/tasks/1151/diff`): renders "Loading diff…" — the task-scoped API 404s on the preview board, so the declared state isn't shown.
- Declared "Task diff at 390px … (light)" (`default-2.png-1.png`): same route, renders "No diff available."
- Auto `/repo/working-diff` (`default-2.png`): "No diff available." (clean board worktree); no capture for `/tasks/:taskId/conflict-diff` or a 320px viewport. Populated-diff evidence exists only in auto `default-3.png` (commit route, 44px Back visible).

## Bugs
None found
No further findings of this class were found after grepping: `DiffView.vue` template + scoped styles, `style.css` (`.drawer-mobile-back`, `--ring` per theme, universal `box-sizing`), `router.ts` route names/paths, both touched test files, the diff/merge-conflict store loaders, and the task bookkeeping diff. No new `node`/`npm`/`npx` invocations.

## Edge cases
- 320px: the `max-width: 719.98px` arm applies, and min-width/min-height 44px with border-box guarantee the box; the topbar is tighter there (filename, delta, status) but the `esc` hint removal nets +20px. Not visually captured.
- `(pointer: coarse)` also hides the `esc` hint on touch laptops and narrow desktop windows; Escape still works, so this is cosmetic.
- Focus ring: button sits at y=2 in the 48px bar, so the 2px outline + 2px offset clips its top edge; left/right/bottom remain visible. Not blocking.
- Sibling file-tab arrows remain 28×28 on mobile — explicitly out of scope.

## Suggestions
Re-take the two declared captures on the `/repo/commits/:sha` route the report says they now use (they still point at `/tasks/1151/diff`), and add a conflict-diff and a 320px capture so all four routes and both required widths are visible. Optionally use a 1px offset for the mobile ring so it isn't clipped at the topbar's top edge.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

