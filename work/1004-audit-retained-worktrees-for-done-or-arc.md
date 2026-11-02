---
id: 1004
title: Make retained worktree cleanup safe and actionable
type: chore
status: active
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/make-retained-worktree-cleanup-safe-and-
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-11-01T15:50:52Z"
updated_at: "2026-11-02T17:58:40Z"
check_retry_count: 2
last_check_failure: "repoos check at 2026-11-02T17:37:43.905Z: repoos check failed: ui verification failed: timed out waiting for the task's browser capture"
review_rounds: 1
review_passes: 1
---
## Problem
The 2026-11-01 cleanup found 48 registered worktrees: 28 were clean feature worktrees whose branches were already merged into main, and 16 were protected. Running `repoos gc --yes` removed the safe candidates; the current count is 21 with zero remaining cleanup candidates and 16 protected worktrees.

The protected set revealed several different cases: 12 tasks marked done (six with commits not in main; six with uncommitted changes limited to work/*.md, while #0664 also has uncommitted repository files); #0652 is archived but still has ready status; #0794 is human-assigned and ready; #1000 and #1001 are active. Four additional registered worktrees are outside RepoOS's managed task-worktree directory (three Codex worktrees and /private/tmp/pre-merge-0960).

The current warning gives one total and suggests `repoos gc`, but does not make clear which entries are safe to remove, why others are retained, or that normal maintenance only collects integration candidates.

## Desired UX
Make cleanup run automatically for worktrees that RepoOS can prove are safe to remove, and explain retained worktrees by reason. Derive fail-closed rules for completed, archived, missing, dirty, and unmerged task branches. Keep active or human-owned work protected; preserve any source or task data that is not proven redundant with the canonical main checkout. Make dry-run output and the worktree warning distinguish safe cleanup candidates from protected entries and worktrees outside RepoOS's control.

## Acceptance criteria
- Audit each currently retained RepoOS task worktree and record its task status, branch commits relative to main, changed source paths, dirty paths, and safe disposition.
- Automatically reclaim clean, merged worktrees for resolved tasks according to tested lifecycle rules, without requiring an operator to discover and run `repoos gc --yes`.
- Define and test when dirty work/*.md changes in resolved worktrees can be replaced by canonical main task files; never clean them based on path alone if they contain unique task data.
- Keep any unmerged source changes, unexplained dirty files, active-agent worktrees, and human-assigned worktrees unless a safe RepoOS workflow resolves them.
- Decide and test how archived-but-ready tasks are treated; do not equate archive metadata with proof that branch contents are disposable.
- Do not inspect or remove external Codex worktrees or `/private/tmp/pre-merge-0960` as RepoOS task worktrees.
- Add tests for safe merged-and-clean branches, task-file-only dirt, unmerged commits, dirty source files, archived-ready tasks, active tasks, and task files that have unique noncanonical content.
- Report candidate and retained counts with actionable reasons; `repoos gc --dry-run` and status output agree.
- Update worktree-GC documentation to describe the automatic policy and its safety limits.

## Notes for AI
Use the 2026-11-01 findings as evidence, then re-check every live task and worktree before implementation. Do not delete a branch merely because its task says done or archived; prove its relevant tree is represented in main. Use RepoOS commands for task lifecycle changes. Preserve the four non-RepoOS worktrees and the active/human work listed above.

## Audit — 2026-11-02
Live audit re-run 2026-11-02 with the new sweep. Registered worktrees: 21 total, 18 managed, 3 external. Disposition: 0 safe candidates, 17 retained, 3 external. The 28 clean merged worktrees from 2026-11-01 are already gone; this is the protected residue.

| Task | Status | Ahead of main | Dirty paths (repo-relative) | Changed source paths / reason | Disposition |
| --- | --- | --- | --- | --- | --- |
| #0898 | done | 3 | — | AGENTS.md, docs/driver-notes.md, scripts/run-tests.mjs, … (46 paths not in main) | retained: post-merge delta not byte-represented |
| #0830 | done | 1 | — | AGENTS.md, docs/close-out-pipeline.md, docs/previews.md, repoos.toml, … | retained: post-merge delta not byte-represented |
| #1007 | active | 16 | src/server/__tests__/engineering-reports.test.ts, src/server/handoff.ts | — | retained: agent still active |
| #0535 | done | 0 | work/0534-authorize-every-telegram-message-against.md | — | retained: dirty task file has unique data |
| #0794 | ready (human) | 0 | — | — | retained: human-assigned |
| #1004 | active | 0 | — | — | retained: agent still active (this task) |
| #0593 | done | 0 | work/0591-width-aware-cli-layout-shared-layout-hel.md | — | retained: dirty task file has unique data |
| #0598 | done | 0 | work/0595-failure-tl-dr-for-move-to-done-errors.md | — | retained: dirty task file has unique data |
| #1009 | active (archived) | 0 | src/ui-app/tests/remote-validation.test.ts | — | retained: agent still active; archive is not proof |
| #0596 | done | 0 | work/0589-record-failing-test-names-for-remote-che.md, work/0592-skip-check-gate-with-actionable-reminder.md | — | retained: dirty task files have unique data |
| #0652 | ready (archived) | 4 | — | AGENTS.md, docs/close-out-pipeline.md, src/commands/check.ts, src/core/check-cache.ts, … | retained: archive metadata is not proof; content not represented |
| #0594 | done | 1 | — | src/commands/shot.ts, src/core/shot-page.ts, src/core/shot-plan.ts, src/server/shot-capture.ts | retained: post-merge commit was cherry-picked as #0597; no recorded merge proof to isolate it |
| #0960 | done | 0 | work/0960-task-hold-one-durable-documented-state-t.md | — | retained: dirty task file has unique data |
| #0664 | done | 9 | .githooks/pre-commit, .repoos/canary.txt, LICENSE.md, install.sh, justfile, landing/**, macos/**, … | — | retained: unexplained dirty repository files |
| #0834 | done | 1 | — | src/cli/api-route-parity.ts, src/cli/help.ts, src/commands/control-api.ts, src/core/config.ts, … | retained: post-merge delta not byte-represented |
| #0840 | done | 5 | — | src/core/agent-contract.ts, src/core/shot-fixtures.ts, src/server/ui-handoff-gate.ts, src/ui-app/src/components/ActivityIndicator.vue, … | retained: post-merge delta not byte-represented |
| #0600 | done | 0 | work/0599-fix-the-gitignore-generated-by-repoos-in.md | — | retained: dirty task file has unique data |

External (never inspected or removed): `codex/chat-diagnostics`, `codex/unsandboxed-engineering`, `codex/dependency-confirm-dialog` under `~/.codex/worktrees/`. `/private/tmp/pre-merge-0960` is no longer registered; if it reappears it is external and untouched.

No current worktree is provably safe to remove. Future merged-and-clean worktrees for resolved tasks are reclaimed automatically at boot/close-out, and `repoos gc --dry-run` / `repoos status` report the same candidate / retained / external counts.

## Shots
```json
[]
```

## Activity

- 2026-11-01T15:50:52Z · created · njachowski@gmail.com
- 2026-11-01T15:54:14Z · title
- 2026-11-01T15:54:15Z · body: Problem (added 3, removed 1)
- 2026-11-01T15:54:16Z · body: Desired UX (added 1, removed 1)
- 2026-11-01T15:54:17Z · body: Acceptance criteria (added 9, removed 7)
- 2026-11-01T15:54:19Z · body: Notes for AI (added 1, removed 1)
- 2026-11-01T19:43:56Z · status inbox→ready
- 2026-11-02T13:28:18Z · cli_override
- 2026-11-02T13:28:24Z · model_override
- 2026-11-02T13:28:35Z · status ready→active, branch
- 2026-11-02T13:37:07Z · message_queued at 2026-11-02T13:37:07.634Z
- 2026-11-02T13:37:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-02T13:42:07Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-02T14:24:56Z · body
- 2026-11-02T14:37:22Z · message_overdue: still queued after 60m without being delivered
- 2026-11-02T14:37:23Z · message_queued at 2026-11-02T14:37:23.065Z
- 2026-11-02T14:38:12Z · body
- 2026-11-02T14:41:53Z · body: Audit — 2026-11-02 (added)
- 2026-11-02T14:41:53Z · message_queued at 2026-11-02T14:41:53.420Z
- 2026-11-02T14:42:58Z · body
- 2026-11-02T14:56:38Z · body
- 2026-11-02T14:56:57Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 3s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-02T14:57:27Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-02T14:58:42Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 0s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-02T14:58:57Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-02T14:59:49Z · handoff_deferred: 3 queued message(s) must be read before review
- 2026-11-02T14:59:49Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-02T14:59:50Z · message_delivered: 3 message(s)
- 2026-11-02T16:10:53Z · note: ui verification failed (1 issue(s)): [missing-target] Worktree cleanup preview separates safe candidates, retained reasons, and external worktrees (target "default"): loading state detected: loading text "Loading…" on / (http://127.0.0.1:50331/?shotState=system%3AworktreeGc)
- 2026-11-02T16:10:53Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-11-02T16:13:47Z · body
- 2026-11-02T16:14:21Z · body
- 2026-11-02T16:47:03Z · status active→review
- 2026-11-02T16:50:51Z · note: review pass 1: needs some work
- 2026-11-02T16:50:52Z · status review→active
- 2026-11-02T16:50:54Z · CTO nudge: held — remote validation is running
- 2026-11-02T17:07:17Z · note: handoff requested (ui-review)
- 2026-11-02T17:10:03Z · body
- 2026-11-02T17:11:05Z · CTO nudge: held — handoff gate is running
- 2026-11-02T17:26:05Z · CTO nudge: held — remote validation is running
- 2026-11-02T17:38:10Z · note: adopted orphaned engineer pid 69938
- 2026-11-02T17:42:17Z · body
- 2026-11-02T17:48:09Z · message_queued at 2026-11-02T17:48:09.275Z
- 2026-11-02T17:48:09Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-02T17:53:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-02T17:55:50Z · body
- 2026-11-02T17:58:40Z · handoff_deferred: 1 queued message(s) must be read before review
