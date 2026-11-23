# Protected worktree triage

`repoos gc --dry-run` was run in the task worktree on 2026-11-23. It reported 0
safe candidates, 14 retained managed worktrees, and 3 worktrees outside RepoOS's
managed directory. Counts below group the retained rows by their reported reason
(with the `live-task` rule taking precedence over dirt in a live worktree).

| Class | Count and example from this run | Recommended action |
| --- | --- | --- |
| Live task (`active` or `review`) | 5; `feat/close-outs-validate-several-tasks-at-onc` | Keep while the task is live. |
| Human-owned task | 1; `feat/live-verification-of-jev-and-clef-flash-` | Ask the human before archiving or removing. |
| Local data (uncommitted or ignored files) | 1; `feat/publish-repoos-hub-android-apk-on-github` | Ask the human to preserve or identify the data before any removal. |
| Unmerged work / task content not represented in main | 7; `feat/review-and-safely-clean-task-worktrees` (#1055) | Ask the human to decide whether to land, archive, or retain it. Do not infer that `done` or archived metadata makes an unmerged branch disposable. |
| Unknown lifecycle (no task record) | 0 | Fix the missing/stale task-record cause first; preserve the worktree until lifecycle is known. |
| External worktree | 3; `codex/chat-diagnostics` | Keep; these are outside RepoOS's managed directory and are not inspected or managed. |

The run also included live task worktrees with dirty paths; these count as
`live-task` because the active task is the primary reason they must remain.
The report's `reason`, `dirtyPaths`, `ignoredPaths`, and `changedSourcePaths`
retain the detail needed for follow-up.

## Removal policy

This change adds read-only triage only. Unsafe worktrees and branches still
cannot be removed by `gc` or a scheduled sweep. If a future workflow supports
removal, it must ask for explicit confirmation for each worktree and preserve
the branch tip and any dirty work before removal, with a tested restore path.
`archive-then-remove` is not recommended for a current class until that
preservation workflow exists. Safe cleanup remains governed by #1004; scheduled
safe-case cleanup in #1055 is unchanged.
