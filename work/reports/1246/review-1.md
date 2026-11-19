---
task: "1246"
pass: 1
at: "2026-11-19T21:20:38.314Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-task-cards-and-board-columns-wit
state: ok
tree_identity: "67c4c055a:1ce9410095"
---
## Verdict
good to go — `EVIDENCE-GAP-ONLY`: code is sound; the one declared shot can't show what its label claims (fixture handle is short). Non-blocking.

## Relevance
still relevant — card states at narrow widths are user-visible and the fixture-driven headless pass is the right method; no later work supersedes it.

## Evidence
- `Human-assigned card with a long handle wraps inside the card` — the declared fixture `card:humanStep` (shot-preview-fixtures.ts:2202) sets `assignedTo: "Nick"`, a short handle. The capture (route matched, clean console, current tree) renders the human chip state but cannot exercise the long-handle wrap the task fixed. Recommend re-declaring with a long handle or a fixture override.
- The three real fixes (header wrap, type-chip truncation, human-chip shrink) are otherwise only evidenced by the new suite's JPEGs in gitignored `.repoos/qa-evidence/1246/`, not by a handoff shot.

## Bugs
None found

No further findings of this class were found after grepping: TaskCard.vue header row, `gap-[7px]` across src/ui-app/tests, `tc-human-chip` usages, `data-tip` styling in style.css, native `title=` additions in the diff, InputCard.vue sibling header, repoos.toml, shot-preview-fixtures `card:*` states.

## Edge cases
- Board columns: the task title names them, but the QA doc scopes them out as a limit. I checked `BoardColumn.vue`: `.col-label` already ellipsizes (`overflow:hidden; text-overflow:ellipsis; nowrap`) and `board-column-labels.test.ts` covers custom labels, so the gap is tolerable, but the doc's Limits should be read by the human before sign-off.
- The no-placeholder regex `\b(undefined|null|NaN)\b` would false-fail a legitimate title containing "null" (e.g. nullable-fields work); fixtures are controlled today.
- The `inHorizontalScroller` skip could mask a real spill inside a scrollable chip row of a card.
- Card widths (351/336/220 px) are assumed, not measured from a live board — stated in the doc.
- `cardCss` is compiled from the baseline fixture's `CopyableNumber` scope only; other children with scoped layout aren't loaded in WebKit (documented).

## Suggestions
- `InputCard.vue` (line 31) still has the identical non-wrapping header with an untruncated type chip — the same class this task fixed in `TaskCard`. Worth a follow-up item in a small-fixes bundle.
- Re-declare the shot with a long `assignedTo` handle so the capture demonstrates the fix it names.
- The `needs merge` badge keeps a native `title` tooltip (pre-existing, untouched); fine here, just don't copy the pattern in new UI.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T21:19:06.878Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

