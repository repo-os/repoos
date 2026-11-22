---
task: "1260"
pass: 3
at: "2026-11-20T14:04:31.727Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/work-board-apply-the-queue-sort-and-make
state: ok
tree_identity: "42ae779ce:74941c62db"
---
## Verdict

`good to go` — both #1257 gaps closed: the board applies `sort=oldest|newest` with a chip, and every phone-only `status` value shows an ignored notice; no code defects found.

## Relevance

`still relevant` — the board previously dropped `sort` and silently showed all tasks for phone-only statuses; this diff fixes exactly the two QA gaps and nothing has superseded it.

## Evidence

None. The declared shot (`default` → `/work?sort=oldest&status=held`) rendered on the app target, route matched, zero console errors; I read the PNG — both chips visible and highlighted, Sort control shows "Sort: Oldest updated". Capture tree 74941c62db differs from reviewed HEAD 42ae779ce only by bookkeeping commits, so it stays current.

## Bugs

None found

No further findings of this class were found after grepping: WorkView.vue's sort/notice wiring and `setBoardSortOrder`, BoardQueueFilters.vue chip construction, MobileWorkQueue.vue's sort comparator refactor, all `firstString` callers and `clearWorkQueueFilterQuery` in workQueueFilters.ts, BoardColumn.vue's done-column "current" re-sort, repo.ts `byStatus`/`sortTasks` ordering, and the QA doc's Clear-filters wording.

## Edge cases

- Round-1 findings remain fixed; no `src/` change since the pass-2 reviewed tree (ad35b0680), so pass 2's clean result carries to HEAD.
- Round-3 engineering report is flagged stale, but `git diff 803455364..HEAD -- src/` is empty — its "no product code changed" claim holds. Its change summary diffs a pre-merge base and wildly overstates scope; not evidence.
- Server landing checklist (computed at 74941c62d) fails merge/scope on *other tasks'* `work/*.md` bookkeeping; the post-checklist heal commit (42ae779ce) and AGENTS.md's handoff heal make these landing-process state, not source conflicts — no `src/` or docs conflict exists.
- With stored Sort "Priority level" (`repo.sortOrder === "current"`), BoardColumn re-sorts the done column by recent-done, so that one column ignores the URL sort while the chip claims it applies (see Suggestions).
- Bare, empty, repeated and unknown `status` all notice, never silent; Clear keeps a board column and drops the rest; repeated `sort` takes the first value in both apply and notice paths.

## Suggestions

- Done column + "Priority level" stored sort contradicts the "Sort: Oldest updated" chip for that column only. Consider suppressing the done re-sort while a URL sort is present, or noting it in the QA doc.
- A repeated `sort` key silently honors the first value; a parallel "use one sort" notice would match `status`'s behavior.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T13:26:15.607Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

