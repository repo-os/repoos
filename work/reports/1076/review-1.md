---
id: review-1
title: review-1
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/engineer-self-check-wip-commits-re-commi
task: "1076"
pass: 1
at: "2026-11-09T13:32:29.731Z"
agent: reviewer
cli: claude code
model: haiku
state: ok
tree_identity: "85a313c01:"
---
## Verdict
`needs some work` — the handoff restore fails on a dirty sibling file it should heal, its new commit is a bare commit, and the checkpoint's foreign-file reset never runs.

## Relevance
`still relevant` — the checkpoint and handoff code paths this task targets are unchanged on `main`, so the problem is still live.

## Evidence
None

## Bugs
1. **Handoff restore throws on a dirty branch-added sibling.** `src/core/git.ts` `restoreForeignTaskBookkeepingFromMain`, the `git rm -q -- ...addedByBranch` call. A sibling file the branch added, with a dirty worktree copy, makes `git rm` fail ("has local modifications"). I reproduced this in a scratch repo. The function's comment says a dirty copy "is left for the commit gate", but the review gate unstages `.md` siblings rather than committing them, so the copy stays dirty. The throw becomes `fail("commit")` in `src/server/handoff.ts`, so handoff stops on the exact drift this task targets. Fix: `git rm -f --` or `git rm --cached` plus a worktree delete.
2. **Bare `git commit` in the new restore and in the same class of worktree commits.** The restore commit at `git.ts` (`commit -m ...`, no pathspec) commits the whole index. The task's own rule is that a bare commit is unsafe. Same pattern, same worktree class:
- `src/server/engineer-remote-self-check.ts` is fixed, but `src/server/review-guard.ts:180` (implement commit) is bare after an `.md`-only unstage. Foreign `work/reports/<id>/*.json` is not `.md`, so it stays staged and gets swept into the implement commit. Then the restore has to heal it.
- `src/core/lockfile-conflict.ts:77-82` runs `add -A` then a bare `commit --no-edit` in the task worktree during merge-of-main.
- `src/server/done.ts:608` runs a bare `commit` in the task worktree after dropping `dist`.
- Main-checkout siblings, out of this task's scope but the same pattern: `src/core/git.ts` `commitDirtyFiles` (`add -A`, bare commit) and `gitCommitAll`.
3. **The checkpoint's foreign reset is dead code.** `commitWipCheckpointForRemoteGate` builds its foreign list from `uncommittedWorkFiles(…, workFileFilter(config))`. That filter goes through `isGeneratedOrRuntimePath`, which returns true for every `work/` path, so `dirty` never contains `work/` files and `foreign` is always empty. The `reset HEAD` never runs. The pathspec commit keeps the sibling out of the commit, but the sibling stays staged in the index for the next bare commit. The test does not assert the index afterwards.
4. **Criterion 1 is not implemented as written.** The spec asks to stop the server write paths or send them to main. The change only documents them as "not deliberate" and adds commit-boundary guards. Nothing is changed at a write site.
5. **Test gaps.** `handoff-foreign-bookkeeping-1076.test.ts` calls the restore function directly, not `runHandoffFinalization`. It has no dirty branch-added case (bug 1) and no check that the checkpoint leaves the index clean (bug 3).

## Edge cases
- The restore uses `currentBranch()` of the main checkout as its base. If main is checked out on another branch, the merge-base is wrong.
- The restore is skipped for hotfixes, which is intended.
- I did not re-run tests or the landing checks. I relied on the implementer's green gate and the server's checklist.
- `repoos landable`'s "another task's bookkeeping" message (`src/core/landable.ts:425`) already names files and cause, so criterion 4 holds.

## Suggestions
- Filter the checkpoint's foreign list from `git diff --cached --name-only`, not from the dirty list.
- Pass `-- <paths>` to the restore commit and to `review-guard.ts`'s implement commit.
- Extend `review-guard.ts`'s unstage filter from `.md` to all foreign bookkeeping (use `foreignTaskBookkeepingPaths`).
- Add a test for the dirty branch-added case and an index-clean assertion after the checkpoint.

## Verdict
`needs some work` — the handoff restore fails on a dirty sibling file, and the checkpoint's foreign reset never runs.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

