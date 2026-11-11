---
id: "1086"
title: Branch fails scope check on other tasks' bookkeeping that main legitimately has; sync does not bring it in (kamrai report)
type: bug
status: active
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/branch-fails-scope-check-on-other-tasks-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-10T08:56:33Z"
updated_at: "2026-11-11T01:08:45Z"
review_rounds: 2
review_passes: 2
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

## Accepted scope and known limitations
FINAL (pass 2 freeze): the only blocking items are the three DOC corrections: (1) docs/agent-workflow-rules.md and docs/close-out-pipeline.md must not say the restore never fails a handoff, state that restore errors fail the handoff at the commit step with the named paths; (2) the same docs and AGENTS.md must say post-merge siblings that exist on main are dropped from the branch (main's copy wins) as well as restored; (3) docs must say sync heals after failed syncs too. NOT blocking, follow-up only: restore running before the report commit instead of last; a test for the server.ts sync wiring; repoos.toml exclusion in dropForeignBookkeepingPathsMatchingMain; request-close-out changedPaths. Report these under Suggestions, not Bugs.

## Activity

- 2026-11-10T08:56:33Z · created · njachowski@gmail.com
- 2026-11-10T08:56:34Z · needs_input
- 2026-11-10T13:33:42Z · status inbox→ready
- 2026-11-10T13:33:43Z · cli_override, model_override
- 2026-11-10T23:04:09Z · status ready→active, needs_input, branch
- 2026-11-10T23:14:55Z · message_queued at 2026-11-10T23:14:55.217Z
- 2026-11-10T23:14:55Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-10T23:19:55Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T23:21:42Z · body
- 2026-11-10T23:49:32Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T23:56:50Z · body
- 2026-11-11T00:15:03Z · queued message undelivered for 60m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-11T00:15:18Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: Fixing restore logic: foreign bookkeeping that exists only on main (not at merge-base) should be removed from the branch, not checked out from main. · stderr: (empty)
- 2026-11-11T00:15:18Z · message_delivered: 1 message(s)
- 2026-11-11T00:18:02Z · body
- 2026-11-11T00:19:32Z · message_queued at 2026-11-11T00:19:32.959Z
- 2026-11-11T00:19:33Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T00:24:32Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T00:30:30Z · body
- 2026-11-11T00:33:44Z · status active→review
- 2026-11-11T00:33:45Z · note: Task body is underspecified: missing sections: Acceptance criteria, Notes for AI
- 2026-11-11T00:33:45Z · message_queued at 2026-11-11T00:33:45.381Z
- 2026-11-11T00:33:45Z · note: shots: skipped — the diff (12 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-11T00:35:35Z · note: review pass 1: needs some work
- 2026-11-11T00:35:35Z · message_delivered: 1 message(s)
- 2026-11-11T00:35:35Z · status review→active
- 2026-11-11T00:53:15Z · body
- 2026-11-11T00:57:19Z · status active→review
- 2026-11-11T00:57:19Z · note: Task body is underspecified: missing sections: Acceptance criteria, Notes for AI
- 2026-11-11T00:57:19Z · message_queued at 2026-11-11T00:57:19.333Z
- 2026-11-11T00:57:19Z · note: shots: skipped — the diff (15 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-11T00:59:09Z · note: review pass 2: needs some work
- 2026-11-11T00:59:09Z · message_delivered: 1 message(s)
- 2026-11-11T00:59:09Z · status review→active
- 2026-11-11T01:04:35Z · body: Accepted scope and known limitations (added)
- 2026-11-11T01:04:35Z · message_queued at 2026-11-11T01:04:35.833Z
- 2026-11-11T01:04:36Z · message_queued at 2026-11-11T01:04:36.538Z
- 2026-11-11T01:08:45Z · CTO nudge: held — an undelivered message is already queued
