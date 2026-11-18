---
task: "1157"
pass: 4
at: "2026-11-17T19:23:48.279Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-use-the-repoos-web-app-on-deskto
state: ok
tree_identity: "45888f7a0:"
---
## Verdict
`needs some work` — the 320 px captures the report says it inspected show clipped and overlapping controls; no app fix landed.

## Relevance
`still relevant` — nobody else drives the real UI at phone widths, and this pass's own screenshots show the narrow-width regressions are still there.

## Evidence
None

## Bugs
- **Class: narrow-width control clipping/overlap** — `MobileWorkQueue.vue` `.mobile-queue-row` (grid `1fr 1fr auto`; `.mobile-sort` lacks `min-width: 0`) at 320 px: the status Select clips "Needs attention" to "Needs attentic" and the sort button paints over it (`work-board-320-light.png`, `-dark.png`). Same class, same width, all in captures the report calls clean:
  - TaskDrawer quickbar status select clips to "Ac" (`drawer-320-light/dark.png`).
  - Inputs card byline clipped to "by hello@re" (`inputs-320-light.png`).
  - Agents error card clips the unbroken `CURSOR_API_KEY/CURSOR_AUTH_TOKEN` token (`agents-320-light.png`).
  These are the "small and clear" defects AC3 says to fix with a test; the report instead states "no … clipping, or overlapping controls at the tested viewports".
- **Class: verification overclaim** — `docs/qa/2026-11-web-qa-pass.md`: the drawer's Changes/Tokens/Debug tabs are reported as selected, but `action-drawer-changes|debug|tokens-390-light.png` are byte-identical captures of an open "Move to review?" dialog (the harness clicked the unscoped "Review" action button), and no distinct Tokens/Debug capture exists in the evidence.
- **Class: dangling evidence reference** — the same doc's reproduce steps (`bun .repoos/qa/1157/pass.mjs`) and every cited PNG live under gitignored `.repoos/`, so after close-out the matrix it references is gone; attach representative captures with `repoos update 1157 --screenshot`.

No further findings of this class were found after grepping: 320 captures for control, stories, releases, deployments, dev, agents, checks, settings, context-skills, work-board, drawer and inputs; `.mobile-chip-row`, `.settings-tabs` and the Context tab strip (`overflow-x: auto`, intentional); the Checks tab strip (it wraps); 390/1440 Work, drawer and Inputs captures; `MobileWorkQueue.vue`, `TaskDrawer.vue` and the `style.css` quickbar rules.

## Edge cases
- Theme was set by writing `document.documentElement.dataset.theme` after load in `pass.mjs` rather than through the app's toggle, so a toggle-only repaint bug would not surface.
- Bottom-scroll measurements exist only at 390 light; 320/1440 bottoms were never measured, and `remaining: 0` does not prove the last row clears the fixed dock.

## Suggestions
- Attach or commit a trimmed matrix so the report stays checkable, and drop the non-comparisons (`checks-runs-320-light` == `checks-320-light`, `bottom-settings-themes` == `bottom-settings`).

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

