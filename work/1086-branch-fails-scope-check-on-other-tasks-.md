---
id: "1086"
title: Branch fails scope check on other tasks' bookkeeping that main legitimately has; sync does not bring it in (kamrai report)
type: bug
status: review
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/branch-fails-scope-check-on-other-tasks-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-10T08:56:33Z"
updated_at: "2026-11-11T00:33:44Z"
---
## Problem
Reported from a new RepoOS project (kamrai, on the mini, RepoOS v0.5.80). A task branch fails the scope check ("diff changes another task's bookkeeping") on files that already exist on main, and the engineer cannot fix it: each time they restore the files from main, the files come back as uncommitted changes (one modified, four untracked) and the committed branch still lacks them. `repoos landable` stays red with no code involved.

Files in the report: work/0004-<slug>.md, work/reports/0003/summary.md, work/reports/0004/{review-1,review-2,summary}.md.

## What the reporter verified
- Main has the files, from RepoOS's own post-merge commits (#0003 summary, then #0004 summary and reviews).
- The commit that added them is an ancestor of the branch HEAD, yet the files are not in the HEAD tree. `repoos sync <id>` made a merge commit that changed only the task's own file, so the files were not brought in.
- The engineer's feature commit touched reports/0004/summary.md and reports/0003/summary.md and also added round-1.json / round-2.json that belong to the other task.
- Two tasks ran concurrently in sibling worktrees while two others landed and wrote post-merge bookkeeping to main.

## Hypothesis (unconfirmed)
The engineer's feature commit contains copies of main's post-merge files with different content, so every later merge keeps the branch's (absent or different) version. The leftover working-folder copies are written back by later checkouts. Likely cause: sync/merge resolution does not handle bookkeeping files (work/reports, other tasks' work files) that land on main while a task branch is open. Related to #1076 (stray bookkeeping in branches); check whether this is the same root cause or another path.

## Repro
Start two tasks. Land one so main gets its post-merge summary.md and review-*.md files. Run `repoos sync` on the other, request review, run `repoos landable`.

## Acceptance
1. Reproduce in a test (two tasks, one lands, sync the other): the scope check does not flag other tasks' bookkeeping that main legitimately has.
2. `repoos sync` / merge of main brings in main's bookkeeping files unchanged, or the scope check ignores differences that equal main's version.
3. Engineer feature commits never include other tasks' work/ or reports files (guard at commit time), and handoff restores them from main automatically as the last step instead of leaving uncommitted/untracked leftovers.
4. Manual workaround documented in the task report: commit the restore on the branch.
5. Check git history of sync and the scope check for a recent regression.

## Activity

- 2026-11-10T08:56:33Z · created · njachowski@gmail.com
- 2026-11-10T08:56:34Z · needs_input
- 2026-11-10T13:33:42Z · status inbox→ready
- 2026-11-10T13:33:43Z · cli_override, model_override
- 2026-11-10T23:04:09Z · status ready→active, needs_input, branch
- 2026-11-11T00:33:44Z · status active→review
