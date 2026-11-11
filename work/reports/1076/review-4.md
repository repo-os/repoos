---
id: review-4
title: review-4
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/engineer-self-check-wip-commits-re-commi
task: "1076"
pass: 4
at: "2026-11-09T22:50:13.551Z"
agent: reviewer
cli: claude code
model: haiku
state: ok
tree_identity: "9e65b6734:"
---
## Verdict
`needs some work` — the new commit-boundary scoping misses a hotfix commit and the union-merge commit, and the restore comment contradicts its caller.

## Relevance
`still relevant` — the sibling-bookkeeping commits this task targets are still on `main`, and the branch's own diff is the fix for them.

## Evidence
None

## Bugs
1. **Unscoped commit in a task worktree (class: bare `git commit` after a staging step).**
- `src/server/review-guard.ts:101`: the hotfix implement commit is bare after `add -- sourceFiles`. A sibling already staged in the index rides the commit. Hotfixes also skip the restore (`handoff.ts`, `if (!isHotfix)`), so nothing heals it. Fix: pathspec the commit to the staged paths, as the non-hotfix branch at `:197` does.
- `src/server/integration-orchestrator.ts:2202`: the union-merge commit is bare with no foreign unstage, unlike `lockfile-conflict.ts`. The comment at `:2196` says the scoped `add` keeps siblings out, but that only covers the conflicted paths. A sibling staged after the merge started stays in the index. Fix: unstage foreign paths before the commit, as the lockfile path does.
- Checked and sound: the handoff report commit (now pathspec), `lockfile-conflict.ts` (unstage before a bare merge commit), `dropDistBeforeMerge`, the remote checkpoint, and the restore commit.

2. **Comment contradicts its one caller (class: base-branch anchor fallback).** `restoreForeignTaskBookkeepingFromMain` says the main checkout's `currentBranch()` is "deliberately not used", but `handoff.ts:811` passes exactly that as `baseBranch`. The same convention appears at `handoff.ts:989`, `:1084` and `:1101`. Failure: if the main checkout sits on `feat/x`, `merge-base(feat/x, HEAD)` can miss a sibling file present in both trees, so handoff reports a heal and the branch still carries the file. Fix: use the configured base at all four sites, or correct the comment.

3. **Restore silently overwrites dirty sibling copies (class: comment describes behavior that doesn't happen).** `git checkout <base> -- onMain` replaces the working-tree copy too. The comment says "a stray dirty copy in the working tree is left for the commit gate", which is false for the `onMain` paths. Low severity, since server-written copies are stale. Fix the comment or the behavior.

Prior findings verified fixed: the handoff report commit is pathspec-scoped, the dead `branch.<name>.merge-base` read is gone, the landable `nextStep` no longer says to `git checkout main --`, the restore wording matches the branch-point behavior, the dirty branch-added `rm -qf` is covered, and the handoff test drives `finalizeReviewHandoff`.

## Edge cases
- No test covers the hotfix commit path or the union-merge commit with a staged sibling.
- Mergeability: I relied on the server checklist (only the task's own file conflicts) and did not run `merge-tree`.
- I did not re-run the test suite, per the brief.
- No new bare `node`, `npm` or `npx` invocation in the source diff I read.

## Suggestions
- Add a hotfix `guardReviewTransition` test and a union-merge test, each with a pre-staged sibling, so the class is covered by tests and not only by comments.

## Verdict
`needs some work` — the hotfix and union-merge commits are unscoped, and the restore's base-branch comment contradicts its caller.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

