---
task: "1290"
pass: 1
at: "2026-11-26T01:53:42.406Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/hand-off-finish-or-clearly-report-an-unc
state: ok
tree_identity: "fff68cddd:"
---
## Verdict

`good to go` — Merge-in-progress handling matches the spec; ordering, failure modes, and `commitDirtyFiles` guard look correct.

## Relevance

`still relevant` — Uncommitted resolved merges blocking pathspec handoff is a real failure mode this branch fixes at the right layer.

## Evidence

None

## Bugs

None found

No further findings of this class were found after grepping: `src/server/review-guard.ts`, `src/core/git.ts` (`commitDirtyFiles`, `hasInProgressGitOperation`, `commitStagedOnly`), `src/server/handoff.ts` (`restoreForeignTaskBookkeepingFromMain` caller), `src/ui-app/tests/review-guard.test.ts`, `src/ui-app/tests/git-worktree.test.ts`, `docs/agent-workflow-rules.md`, `docs/remote-validation.md`.

## Edge cases

- Merge completion uses a full `git commit --no-edit`, so it does not apply the post-merge `dist` / `repoos.toml` / foreign unstaging that the ordinary implement path does; behaviour relies on a normal merge tree plus the existing post-guard restore (same tradeoff the engineer noted).
- `guardReviewTransition` only special-cases `MERGE_HEAD`; rebase/cherry-pick handoff may still fail with generic git errors (notes-only scope).
- Conflict-marker scan is limited to paths in `git diff HEAD --name-only`; `=======` at line start can false-positive on rare legitimate content.

## Suggestions

- Add the acceptance regression: resolved merge of main where main updated a sibling `work/` file, handoff completes the merge, then assert main's copy on the branch (ideally through guard plus restore, not guard alone).
- Optional: marker only in the working tree (staged clean) and handoff during rebase for clearer errors.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

