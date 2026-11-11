---
task: "1076"
pass: 6
at: "2026-11-10T20:15:49.677Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/engineer-self-check-wip-commits-re-commi
state: ok
tree_identity: "f225dac6f:"
---
Repeated review classes: pass 5 flagged the merge overlap with #1082, and pass 5's verified-fixed list covers the earlier passes' items: unscoped commits in the review guard, the integration union commit, and handoff's base-branch resolution. This pass finds the same kind of gap again, now in the pathspec commits that replaced those bare commits. Each pass has found another commit site or edge of the scoping rule, so a human should look at that recurring pattern. The merge with main is clean now, apart from this task's own file.

## Verdict
`needs some work` — pathspec commits split staged renames (checkpoint and review-guard), a regression from the bare commit they replaced.

## Relevance
`still relevant` — the sibling-bookkeeping leak is still reachable on `main`, and the branch now merges cleanly with it.

## Evidence
None

## Bugs
**1. Class: pathspec commit built from rename-detected name lists.** `git diff --cached --name-only` and porcelain `R old -> new` both report only the new path of a staged rename. A `commit -- <paths>` built from that list commits the new file and leaves the old path's deletion staged, so HEAD keeps the old file. I reproduced this in a temp repo: after `git mv a.txt b.txt`, `git commit -- b.txt` left `D  a.txt` staged and HEAD still tracked `a.txt`. The bare commits this replaced committed both halves. Instances:
- `src/server/review-guard.ts` `commitStagedOnly` (~l.283): implement and hotfix commits, both fail-open for renames.
- `src/server/engineer-remote-self-check.ts:154`: the checkpoint's `toCommit` comes from `dirty`, which `parsePorcelainStatus` (`src/core/git.ts` ~l.2473) reduces to the new name.
- `src/core/git.ts` `restoreForeignTaskBookkeepingFromMain`: `diff --name-only baseFull..HEAD` drops a renamed sibling's old path, so that copy is never restored.
- `src/core/git.ts` `stagedForeignBookkeepingPaths`: same name list, used for the unstage step.

Fix: add `--no-renames` to each name list and keep the pathspec form. Add a test with a staged rename.

**2. Class: retry tolerance skips the heal.** `src/server/handoff.ts` `reportAtHead` (`tolerated`, ~l.785–800) now accepts any foreign `work/` path between the report source and HEAD. It returns the report at ~l.808, before the restore at ~l.887, so the heal is skipped. The comment says the restore commit sits in that range, but the report source is snapshotted after the restore (~l.1161), so that case does not occur. The widening only lets a leaked sibling file skip the heal. Trigger is narrow, but it breaks criterion 3. Fix: revert to the pre-#1076 `tolerated` and rely on the restore.

## Edge cases
- `isTaskMarkdownBookkeepingPath` matches any non-report `work/*.md`, not only `<digits>-*.md`. The new restore would therefore revert a branch's legitimate edit to a non-task markdown file under `work/`. The unstage in `review-guard.ts` already had this shape, so it is pre-existing there but new in the restore.
- No bare `node`, `npm` or `npx` in added lines. The bare commits that remain (`mergeBranch` on the main checkout, the lockfile and union merge commits, `dropDistBeforeMerge`) are documented in the rules doc and handled.

## Suggestions (non-blocking)
- Add tests for the staged-rename case in `scoped-task-commits-1076.test.ts` and `handoff-foreign-bookkeeping-1076.test.ts`.
- Add a test for the `tolerated` retry after the fix in Bug 2.

## Verdict
`needs some work` — pathspec commits split staged renames in the checkpoint and review-guard, a regression; retry tolerance can skip the heal.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

