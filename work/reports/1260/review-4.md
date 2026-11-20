---
task: "1260"
pass: 4
at: "2026-11-20T14:48:54.851Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/work-board-apply-the-queue-sort-and-make
state: ok
tree_identity: "95d9043c4:42ae779ce3"
---
## Verdict

`good to go` — STALE-EVIDENCE-ONLY: the reviewed tree's code is unchanged since pass 3's clean review; only the handoff capture is stale because the final merge of main moved the tree. Review lock sha (d155c84 vs 95d9043) is the same process state, per the server checklist.

## Relevance

`still relevant` — the two #1257 QA gaps (board ignoring `sort=oldest`; phone-only `status` values shown silently) are still open on main and this diff closes exactly them; nothing superseding has landed.

## Evidence

None. The capture itself is usable but stale: tree 42ae779c vs reviewed HEAD 95d9043c. Re-capture on the final tree.

## Bugs

None found

I verified the round-1 findings are fixed in the current code: Sort control binds to `null` with the sort label as placeholder while a URL sort is set, and `setBoardSortOrder` drops any `sort` key; `ignoredStatusText` notices bare, empty, unknown and repeated `status` (raw route value, not `firstString`); picking a sort in the control clears an ignored sort too; the pipeline note covers sort. Round-2 and round-3 verified the same. No task source file changed since the pass-3 reviewed tree (`git diff 74941c62d..HEAD` over the branch's own files is empty); the only delta is the merge of main (95d9043c), which server preflight shows merges cleanly and in-scope.

No further findings of this class were found after grepping: WorkView.vue sort/status wiring and `setBoardSortOrder`, BoardQueueFilters.vue chip construction, MobileWorkQueue.vue's `sortWorkQueueTasks` refactor, `readWorkQueueSort`/`ignoredWorkQueueFilterChips`/`clearWorkQueueFilterQuery` in workQueueFilters.ts, BoardColumn.vue's done-column re-sort, and the QA doc's Clear wording.

## Edge cases

- Fixtures cover 375 (phone queue owns both values, bar not rendered), 768 and 1280 px for sort and the held notice; repeated status, unknown sorts and Clear's keep-a-board-column behavior are unit-tested.
- The stale round-4 engineering report's claims are not evidence; the code-identity check above replaces it.
- Known non-blocking tension from pass 3 stands: done column re-sorts by recent-done under a stored "Priority level" sort, contradicting the sort chip for that column only.

## Suggestions

- The declared shot (`default` → `/work?sort=oldest&status=held`) is stale for 95d9043c because the merge of main brought unrelated UI changes (style.css, TaskCard, SearchOverlay) onto `/work`; re-capture on the final tree.
- Consider a "use one sort" notice for repeated `sort` keys, mirroring `status`.

## Verdict

`good to go` — STALE-EVIDENCE-ONLY: code correct and unchanged since the clean pass-3 review; re-capture the shot on the final tree.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T14:30:25.160Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

