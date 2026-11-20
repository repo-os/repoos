---
task: "1259"
pass: 1
at: "2026-11-20T05:26:01.914Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/work-board-apply-queue-search-and-filter
state: ok
tree_identity: "b53e21aa1:983d57d68"
---
## Verdict
`good to go` — code reuses the shared predicate correctly and the gate is green; EVIDENCE-GAP-ONLY: the single handoff capture shows a loading home page, not the search box.

## Relevance
`still relevant` — main has no board search; the #1257 gap this closes is still open and the QA doc's noted exception is updated to match.

## Evidence
- `default-1.png` (`auto: matched src/ui-app/**`, route `/`) — captured Mission Control in a loading skeleton state (handoff warning `loading indicator [aria-busy="true"]`); it shows nothing of the board search box. The task declared no `## Shots`, so this auto capture is the only visual evidence; a re-capture on `/work` at ≥720 px would show the feature.

## Bugs
None found

No further findings of this class were found after grepping: `BoardQueueSearch.vue`, `WorkView.vue`, `MobileWorkQueue.vue`, `BoardQueueFilters.vue`, `workQueueFilters.ts`, `work-filter-persistence-qa-browser.test.ts`, `work-queue-filters.test.ts`, `docs/qa/2026-11-filter-persistence-qa.md`.

## Edge cases
- IME composition fires `input` per composition update, writing partial text to the URL; the mobile queue's `v-model` behaves the same, so this is parity, not a fork.
- Clear filters removes `q` along with the other keys; the `modelValue` watcher then adopts `""` and clears the draft, so no stale text remains — consistent.
- The search box lives in the `v-else` (non-narrow) branch of WorkView, so phones (<720 px) keep only the mobile queue's input — no duplicate controls.
- `withWorkQueueSearch` keeps array values, bare `?key` nulls and drawer params (`task`, `tab`) untouched; only `q` is set or deleted. Tests cover replace/clear/purity.
- Pipeline view hides the box but the chip bar still renders its not-applied notice — matches the spec.
- The board filters via `matchesWorkQueueFilters` (`visibleByStatus`), so `#`/case normalisation comes from `searchNeedle`; no second predicate was introduced.

## Suggestions
- Re-request the auto shot on `/work` (or declare a `## Shots` entry for the board at a wide viewport) so the drawer shows the search box instead of a loading skeleton.
- No bare `node`/`npm`/`npx` invocations appear in the diff; the QA-doc note now matches the code.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T05:24:16.047Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

