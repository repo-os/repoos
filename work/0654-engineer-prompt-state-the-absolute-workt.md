---
id: "0654"
title: "Engineer prompt: state the absolute worktree path first, and mark the main checkout as off-limits"
type: improvement
status: review
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/engineer-prompt-state-the-absolute-workt
created_at: "2026-10-04T16:38:19Z"
updated_at: "2026-10-04T23:11:37Z"
---
## Problem
Engineer agents sometimes work against the main checkout instead of their task worktree. Analysis of 234 engineer sessions (2026-10-05): 73 calls in 20 sessions (about 10%) used paths under the main checkout (/Users/nick/code/nick/repoos/{src,docs,work,user-docs}/...) instead of the worktree: 33 reads, 30 shell commands, 8 greps, 1 edit, 1 write. Mostly reads, so the main risk is reading stale or divergent code (main moves while the branch does not), plus the rare stray edit. AGENTS.md already warns that harness file tools start in the main checkout.

missionFor() (src/server/agents.ts) does state 'Working directory: <workdir> (a git worktree checked out on branch ...)', but only after the context pack, agent.instructions and any enabled skills, so the path is buried far from the top of a long prompt, and nothing says the main checkout is not to be used.

## Desired UX
The first lines of every managed engineer prompt (before the context pack, instructions and skills) state the absolute worktree path and that all file reads, edits and commands must use paths under it, and name the main checkout path as read-only/off-limits for this task. Same treatment for resume turns and the reviewer prompt if it has the same exposure (check; do not widen scope if not).

## Acceptance criteria
- For a normal worktree task, the first lines of the mission contain the absolute worktree path, an instruction to use absolute paths under it, and the main checkout path (config.root) labelled off-limits.
- HOTFIX tasks are not broken. Hotfix tasks (frontmatter hotfix: true; hotfix_target main|branch, src/core/task.ts) run either on their own branch in the main checkout (not a git worktree) or directly on main. For those, workdir is the main checkout, so the 'off-limits main checkout' line MUST NOT appear and the wording must not say 'git worktree'; the first lines state the real working directory and branch instead. Cover both hotfix targets in tests.
- Tests assert the header for: normal worktree task, hotfix on branch, hotfix on main, and a resume turn.
- No path guard, hook or rewriter is added in this task (out of scope by decision); this is prompt-only.
- Re-measure after it ships: share of engineer sessions with any main-checkout path call versus the 20/234 baseline.

## Notes for AI
The mission is already per-task (the context pack comes first and varies), so putting a task-specific header first does not cost a stable cached prefix that exists today; but see the CACHING comment in missionFor before adding any new per-task content ahead of stable content. Keep the header short (3-4 lines). Do not edit AGENTS.md rules beyond what this change contradicts.

## Activity

- 2026-10-04T16:38:19Z · created · unknown
- 2026-10-04T16:56:47Z · priority
- 2026-10-04T17:42:48Z · status inbox→ready
- 2026-10-04T23:01:41Z · status ready→active, branch
- 2026-10-04T23:11:37Z · status active→review
- 2026-10-04T23:11:37Z · note: shots: skipped — the diff (4 changed paths) touches no [[preview.paths]] globs — no UI change to capture
