---
task: "1260"
pass: 1
at: "2026-11-20T05:49:24.732Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/work-board-apply-the-queue-sort-and-make
state: ok
tree_identity: "ed9f82c6e:903e9a1cd5"
---
## Verdict

`needs some work` — the board's Sort control shows the store's order while the URL sort is applied, contradicting the sort chip; visible in the handoff capture.

## Relevance

`still relevant` — the #1257 QA gaps (board ignoring the queue sort; phone-only statuses dropped silently) are real and this diff addresses both with a shared comparator and the existing ignored-notice path.

## Evidence

None. The single declared shot (`default` → `/work?sort=oldest&status=held`) rendered on the app target, route matched, tree is current (bookkeeping-only delta to HEAD), zero console errors, and the capture clearly shows both the "Sort: Oldest updated" chip and the "Ignored filter: status=held (not a board column)" notice — but it also shows the defect in Bugs.

## Bugs

- **Class: URL-override not reflected in bound control state** — `src/ui-app/src/views/WorkView.vue` binds the Sort dropdown to `:model-value="repo.sortOrder"` while `visibleByStatus` orders columns by `boardQueueSort` (the URL's `sort`). With `?sort=oldest` and the store still on newest, the header shows "Most recently updated" while the board orders oldest — two visible controls disagree, undermining the chip's stated purpose ("so a sorted board never looks like the default"). The handoff capture shows exactly this. Fix: bind to `boardQueueSort ?? repo.sortOrder`; `setBoardSortOrder` already drops the URL sort on change, so the two stay consistent afterwards.

No further findings of this class were found after grepping: WorkView.vue's other header controls (status select is hidden when `statusFilter` applies; human/held toggles own their state), MobileWorkQueue.vue's sort button (re-reads the URL on route change, so it stays synced), BoardQueueFilters.vue chips, and the repo store's `sortOrder` writers.

## Edge cases

- Repeated status (`?status=ready&status=held`): `statusFilter` requires a string, so nothing is applied, but `ignoredWorkQueueFilterChips` checks `firstString` ("ready", a board column) — no notice, silently dropped. Contradicts "none is silently dropped"; arrays predate this change, only status has the apply/notice shape mismatch.
- Bare `?status` or `?status=`: neither applied nor noticed (kept by Clear's design). Same pre-existing shape.
- With an ignored `sort` in the URL, picking a sort in the control drops only applied sorts (`boardQueueSort` is null), so the "Ignored filter: sort=…" chip persists until Clear — accurate, but could feel sticky.

## Suggestions

- On the pipeline view the applied sort chip renders as a normal chip next to the "This view doesn't apply these filters" note; consider wording the note to cover sort, or marking the sort chip ignored there.

## Verdict

`needs some work` — one control-state desync to fix; everything else is edge-case or suggestion level.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T05:47:25.818Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

