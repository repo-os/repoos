---
task: "1076"
pass: 5
at: "2026-11-10T19:12:07.307Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/engineer-self-check-wip-commits-re-commi
state: ok
tree_identity: "cbd6bda3f:"
---
## Verdict
`needs some work` — merge with main conflicts in `engineer-remote-self-check.ts` and `handoff.ts`; the code is otherwise sound.

## Relevance
`still relevant` — the sibling-bookkeeping leak is still reachable on `main`, and nothing on `main` has solved it; #1082 touches the same checkpoint commit, so it needs a merge, not a rescope.

## Evidence
None

## Bugs
1. **Landing blocker: merge conflicts with main (class: overlapping edit to the checkpoint commit and handoff).** Server checklist: `src/server/engineer-remote-self-check.ts` and `src/server/handoff.ts` conflict with main. `main` (#1082) wraps the checkpoint `commit -m msg` in `waitForCheckGateRelease`, while this branch changed the same line to `commit -m msg -- ...toCommit`. The resolution must keep the pathspec inside the wait callback, or the #1076 scoping is lost. Likewise, `main`'s 93-line `handoff.ts` change overlaps this branch's restore and `handoffBaseBranch` edits. The overlapping files that merged cleanly, `review-guard.ts`, `review-guard.test.ts` and `docs/agent-workflow-rules.md`, should be re-read after the merge.

Pass-4 findings verified fixed:
- The hotfix commit in `review-guard.ts` is now unstaged and pathspec-scoped (`commitStagedOnly`).
- The union-merge commit in `integration-orchestrator.ts` unstages foreign paths first.
- `handoffBaseBranch` replaces `currentBranch()` at all sites, and the restore comment matches it.
- The restore comment now says the dirty copy is overwritten on purpose.
- The pass-3 items are fixed: the handoff report commit is pathspec-scoped, the dead `merge-base` config read is gone, and the landable `nextStep` no longer says `git checkout main --`.

I checked the other task-worktree commit sites (`engineer-remote-self-check`, `lockfile-conflict`, `dropDistBeforeMerge`, the `gitCommitAll` and `commitDirtyFiles` pathspecs, `healMissingTaskFile`). Each is scoped, or bare only mid-merge after an unstage. Hotfix skips the restore because hotfix runs in the main checkout (`workdir = config.root`), so that is correct.

## Edge cases
- The restore only sees committed drift (`baseFull..HEAD`). A sibling file that is staged but uncommitted at handoff is left for the commit gate; it does not reach the branch.
- The restore runs before the check snapshot, and the report commit is now pathspec-scoped. A sibling staged during the check cannot ride the report commit.
- No new bare `node`, `npm` or `npx` in the added lines.

## Suggestions (non-blocking)
- After resolving the conflict, rerun the new tests in `scoped-task-commits-1076.test.ts` and `handoff-foreign-bookkeeping-1076.test.ts`, since the pathspec change in the checkpoint now sits inside #1082's wait wrapper.

## Verdict
`needs some work` — merge conflicts in `engineer-remote-self-check.ts` and `handoff.ts` with main (#1082); code otherwise sound.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

