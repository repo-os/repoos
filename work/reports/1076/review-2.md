---
task: "1076"
pass: 2
at: "2026-11-09T15:13:20.758Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/engineer-self-check-wip-commits-re-commi
state: ok
tree_identity: "c4f5742d3:"
---
## Verdict
`needs some work` — the committed `done.ts` dist drop is a silent no-op, lockfile merge still sweeps siblings, and the branch conflicts with main.

## Relevance
`still relevant` — the bare-commit and sibling-bookkeeping paths this task targets are unchanged on `main`, so the problem is still live.

## Evidence
None

## Bugs
1. **Committed `done.ts` dist drop does nothing.** `src/server/done.ts:625` in `c4f5742d3` commits `-- dist/` after `git rm -r --cached dist/`. A pathspec commit takes the working-tree copy, so it sees nothing to commit. I reproduced this in a scratch repo: the command exits 1 with "nothing to commit", and `dist/a.js` stays tracked in HEAD. Close-out then merges with `dist/` still on the branch. The uncommitted working-tree edit reverts to a bare commit after unstaging sibling files. That is the right shape, but it is not committed or tested.
2. **Lockfile merge still sweeps siblings.** `src/core/lockfile-conflict.ts:88` runs `commit --no-edit` bare after a pathspec `add`. The index can still hold another task's staged bookkeeping, and that rides the merge commit into the branch. Git refuses `commit -- <paths>` during a merge, so the fix must unstage foreign paths first, as `done.ts` does in the uncommitted edit. Same class as the `done.ts` bare commit. Main-checkout commits (`git.ts:3106`, `git.ts:3146`, `integration-orchestrator.ts:2201`, `release.ts:148`, `repo-log.ts:147`) are out of scope, since they write to main.
3. **Criterion 1 is still documentation only.** No server write site was changed. Activity, CTO and sync writes still go to whatever path they reach. The branch only adds commit-boundary guards.
4. **Landing conflict in source.** `src/ui-app/tests/check-remote-wip.test.ts` conflicts with main, so the branch is not mergeable as committed. The server checklist reports the same.
5. **Handoff test does not run the handoff.** `handoff-foreign-bookkeeping-1076.test.ts` calls `restoreForeignTaskBookkeepingFromMain` directly, not `runHandoffFinalization`. Criterion 5 ("cleaned at handoff") is therefore only covered at the function level.

Prior-pass status: the dirty branch-added `git rm` is fixed (`-qf` plus a test), the restore and review-guard commits are now pathspec-scoped, and the checkpoint reads the index (`stagedForeignBookkeepingPaths`) with tests. Items 2, 3 and 5 above are still open from pass 1.

## Edge cases
- The worktree has 8 uncommitted modified files beyond `c4f5742d3`, including the `done.ts` fix. None of that is reviewed here, and the landing checklist counts it as dirty.
- No new bare `node`, `npm` or `npx` invocation in the diff. `package.json` `test` and the `justfile` `test-node` recipe are pre-existing and documented.
- Hotfix path skips the restore by design.

## Suggestions
- Commit the `done.ts` fix (bare commit after unstaging foreign paths), with a test that `dist/` is actually dropped.
- Apply the same unstage-then-commit pattern to `lockfile-conflict.ts`.
- Add one `runHandoffFinalization` test with a sibling file already committed on the branch.
- Consider whether criterion 1 needs a write-site change or whether the documented commit-boundary guards are the accepted scope; say so in the spec.

## Verdict
`needs some work` — the committed `done.ts` dist drop is a silent no-op, lockfile merge still sweeps siblings, and the branch conflicts with main.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

