---
task: "1257"
pass: 1
at: "2026-11-20T00:51:05.871Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-work-board-search-saved-filters-
state: ok
tree_identity: "f0de685ce:1ef700606d"
---
## Verdict
`needs some work` — src/ui-app/src/views/WorkView.vue conflicts with main (server preflight FAIL); merge main into the branch (repoos sync 1257), then re-request review.

## Relevance
`still relevant` — the desktop board really did silently drop URL-carried queue filters, and this diff fixes it with a shared predicate, chip bar and clear control; the premise holds.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: `mount(WorkView` in src/ui-app/tests (board-column-labels, deep-link-params — every mount now has a matching `unmount()`), bare `node|npm|npx` additions in the diff (none), `filter-bar`/`filter-chip`/`filter-clear` in style.css (present, styles resolve), `visibleByStatus` callers in WorkView.vue (board columns, keyboard nav at line 317 and collapsed-empty logic all see the filtered list).

Code quality notes: the predicate moved out of `MobileWorkQueue.vue` is behavior-identical (same needle normalisation, area/story/mine checks); `clearWorkQueueFilterQuery` keeps `status`, `task`, `tab`; the WebKit suite runs headless against built assets, satisfying the Playwright-fixture criterion; `docs/qa/2026-11-filter-persistence-qa.md` is committed and honestly records the gaps. Both acceptance criteria that the spec constrains (fixture-only testing, reload/project-switch/clear-all coverage, QA doc) are met. The per-project sort/toggle persistence question is argued correctly: projects are separate origins, so storage is already separated in practice, and the gap is documented rather than guessed at.

## Edge cases
- Pipeline view (`effectiveView === 'pipeline'`) ignores the queue filters and shows no chip bar — same silent-drop pattern as the pre-existing `?status=` handling, so consistent, but a user landing on `/work?q=…` and switching to pipeline sees unfiltered tasks with no sign.
- `clearWorkQueueFilterQuery` drops null-valued query keys (bare `?key`) and non-string array entries, not just the five filter keys — harmless today, but it is a silent loss on clear.
- Invalid URL values are silently ignored: `?priority=p9` yields no chip and no filter; `?mine=2` is ignored (only `1` counts). Reasonable, but invisible to the user.
- Mobile-only `?status=attention|held|…` values show every task on the board with no chip — documented gap, unchanged.
- The reload race where a pending `router.replace` could overwrite a keystroke is reasoned about but untested; jsdom couldn't reproduce it.

## Suggestions
- The handoff auto capture shows route `/` (Mission Control), not the board or the chip bar — it proves nothing about this change. Declare shots, e.g. `/work?q=login&priority=p1` at the three widths, so the next pass has visual evidence on the final tree.
- The three documented gaps (no wide-width search input, board not applying queue `sort`, mobile-only status values) deserve follow-up tasks rather than living only in the QA doc.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T00:49:26.283Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

