---
task: "1061"
pass: 15
at: "2026-11-09T11:40:57.253Z"
agent: reviewer
cli: codex
model: gpt-6.1-terra
branch: feat/checks-stop-repoos-bookkeeping-commits-f
state: ok
tree_identity: "257b1fb47:a434d494b"
---
Repeated review classes: Lifecycle coverage, queue recovery, merge classification and task scope appear addressed. Direct-check drift detection remains incomplete, and lock recovery has another crash window. A human should examine the recurring lifecycle and drift-detection pattern.

## Relevance

still relevant — Bookkeeping commits can still disrupt checks on main.

## Evidence

None

## Bugs

- **Working-tree drift detection:** [check.ts](/Users/nick/code/nick/repoos-worktrees/feat/checks-stop-repoos-bookkeeping-commits-f/src/commands/check.ts:1923) compares `git diff --raw` metadata, whose unstaged destination object ID is zero. If a tracked file is already dirty at check start and changes again, its metadata can remain identical, so a direct check passes despite a net source change. The same snapshot excludes untracked files entirely, so newly created source files also escape detection. Handoff uses a separate content snapshot.
- **Crash recovery:** [check-gate-lock.ts](/Users/nick/code/nick/repoos-worktrees/feat/checks-stop-repoos-bookkeeping-commits-f/src/server/check-gate-lock.ts:430) removes write permissions before persisting their original modes. A crash or persistence error during that interval leaves files read-only without a recovery record. Both fresh-lock branches have this ordering.

## Edge cases

The supplied engineering report is stale: its source commit predates the reviewed implementation. Its test claims are not evidence for the current diff. The server-provided preflight reports only the task-file merge conflict, which close-out resolves.

## Suggestions

Document both accepted limitations: an already-running engineer can write directly, and a source change committed and reverted during a check can escape detection. The current docs claim broader detection than the accepted scope guarantees.

## Verdict

needs some work — Direct checks can miss net source changes, and a crash can leave source files read-only.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

