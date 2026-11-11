---
task: "1076"
pass: 3
at: "2026-11-09T21:03:57.162Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/engineer-self-check-wip-commits-re-commi
state: ok
tree_identity: "6655f4e9c:"
---
## Verdict
`needs some work` — the handoff engineering-report commit (`handoff.ts:1134`) is still a bare commit that can sweep a sibling file in after the restore has run; the fix is a one-line pathspec.

## Relevance
`still relevant` — the bare-commit and sibling-bookkeeping paths are still live on `main`, and #1061 covers only check-time deferral, not commit scoping.

## Evidence
None

## Bugs
1. **Bare commit after the restore point (class: unscoped commit in a task worktree).** `src/server/handoff.ts:1122-1134` stages the report with `add -- reportPath`, then runs a bare `git commit -m "docs: record engineering report…"`. That runs after the check gate (~`:877`), which is minutes long. The restore (`:800-830`) runs only once, before the gate. A sibling `work/<other>-*.md` staged in that window (any `git add -A` in the worktree) rides this commit onto the branch, and nothing re-runs the restore. This breaks the accepted scope ("every commit in a task worktree is scoped") and criterion 3. Fix: `commit -m … -- reportPath`, which is valid because the path is already in the index. I checked the other task-worktree commit sites: `git.ts:2898`, `lockfile-conflict.ts:123`, `integration-orchestrator.ts:2202` and `git.ts:3242` are bare only mid-merge, after a scoped add or an explicit unstage, so they are acceptable. `review-guard.ts` (implement and hotfix), `engineer-remote-self-check.ts` and the restore are scoped or cleared first.
2. **Config key read with no writer (class: dead fallback).** `src/core/git.ts:2794-2801` reads `branch.<name>.merge-base`, and a repo-wide grep finds no writer. The comment "written when RepoOS cut the worktree" is false. The `merge-base <base> HEAD` fallback is what always runs. Either write the key at worktree creation or delete the branch and fix the comment.
3. **Stale remediation text (criterion 4).** `src/core/landable.ts:425-428` still tells the engineer to run `git checkout main -- <path>` by hand. That is the manual fix the spec and `AGENTS.md` say is never needed, because handoff now heals it. Change the `nextStep` to say handoff restores it and to re-request review. This is the only remediation string I found that describes the manual restore.

## Edge cases
- The restore uses the merge-base copy, not main's tip. This matches the 3-dot `main...HEAD` diff and is safe, but the commit message and docs say "main's copy". Reword one or the other.
- Verified in a scratch repo: `git merge` refuses to start over any staged index entry, so the merge-start window is closed. Only the `bun install` window in the lockfile path remains, and the code handles it.
- Prior passes: the `done.ts` dist drop is now `dropDistBeforeMerge` with a test; the lockfile unstage is in place; criterion 1 is documented as accepted; the handoff test drives `finalizeReviewHandoff`; the merge-tree conflict in `check-remote-wip.test.ts` is gone (checklist shows only the own task file). All five are fixed.
- No new bare `node`, `npm` or `npx` invocation in the diff.

## Suggestions
- Add a `finalizeReviewHandoff` test where a sibling is staged (not committed) before the report commit, so bug 1 is covered.
- Tighten `docs/close-out-pipeline.md` and `agent-workflow-rules.md`, which say landable "names the fix"; after bug 3 they should say handoff restores automatically.

## Verdict
`needs some work` — the handoff report commit can still sweep a sibling past the restore; also a dead merge-base config read and a stale landable hint.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

