---
task: "1257"
pass: 2
at: "2026-11-20T01:41:36.299Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-work-board-search-saved-filters-
state: ok
tree_identity: "370583053:3705830538"
---
## Verdict
`needs some work` — src/ui-app/src/views/WorkView.vue still conflicts with main (server preflight FAIL); merge main into the branch, keep both sides, re-request review.

## Relevance
`still relevant` — the board really did silently drop URL-carried queue filters; the shared predicate, chip bar and Clear control fix it, and both pass-1 code findings (pipeline note, ignored-value chips) are genuinely fixed in this diff.

## Evidence
None

## Bugs
- **Class: integration-merge-conflict** — src/ui-app/src/views/WorkView.vue conflicts with main; the landing checklist's Merge-with-main FAIL persists because no merge of main landed after review pass 1 (`git log main..HEAD --merges` is empty; the two commits since are a WIP checkpoint and the report). Code itself is fine; `repoos sync 1257`, keep both sides, re-request review.

No further findings of this class were found after grepping: `git log main..HEAD --merges`, the checklist's per-file conflict list (only WorkView.vue), `mount(WorkView`/`unmount()` pairs in src/ui-app tests (all matched), bare `node|npm|npx` invocations in the diff (none — only `node:` protocol imports, valid under Bun), `filter-bar`/`filter-chip`/`filter-clear`/`board-queue-filters` classes in style.css (present), `visibleByStatus` callers in WorkView.vue (columns, keyboard nav, collapsed-empty logic all see the filtered list).

Round-1 fixes verified in the diff: pipeline view shows the bar with an explicit not-applied note (`:applied="effectiveView === 'board'"`); unusable `priority`/`mine` values render dashed ignored chips and Clear removes them; `clearWorkQueueFilterQuery` keeps null and repeated values. Both shots match the diff — chip bar with "Search: login"/"Priority: P1" + Clear filters highlighted, and the dashed "Ignored priority: p9" chip; console clean; evidence tree only differs from reviewed HEAD by bookkeeping.

## Edge cases
- `?q=%23` (query that trims to just `#`) counts as active and shows a "Search: #" chip while the predicate matches everything — visible but does nothing.
- `?mine=0` shows "Ignored assigned filter: 0"; a user could read 0 as "not mine".
- Reload race (late `router.replace` vs a keystroke) is reasoned about, untested — honestly documented in the QA doc.
- Touch targets on a real device: deferred to the human, as the QA doc states.

## Suggestions
- None beyond the already-filed follow-ups #1259/#1260.

## Could not verify (environment)
None — mergeability comes from the server checklist, per instructions.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T01:40:24.312Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

