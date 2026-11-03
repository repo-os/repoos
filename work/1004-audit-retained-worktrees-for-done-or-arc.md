---
id: 1004
title: Make retained worktree cleanup safe and actionable
type: chore
status: active
needs_merge: true
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/make-retained-worktree-cleanup-safe-and-
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
review_model_override: opencode-go/muse-spark-1.3-contributor
created_at: "2026-11-01T15:50:52Z"
updated_at: "2026-11-03T07:27:35Z"
review_passes: 7
last_check_failure: "repoos check at 2026-11-03T01:54:13.726Z: repoos check failed: ◆ Check plan"
review_rounds: 2
dev_error_count: 2
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
- 2026-11-02T17:58:40Z · agent exited with an error (opencode) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-11-02T18:02:47Z · needs_input
- 2026-11-02T18:02:52Z · message_delivered: 1 message(s)
- 2026-11-02T18:52:01Z · message_queued at 2026-11-02T18:52:01.425Z
- 2026-11-02T18:52:01Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-02T18:57:01Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-02T18:58:36Z · body
- 2026-11-02T19:02:01Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-02T19:02:01Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-02T19:02:01Z · status active→review
- 2026-11-02T19:02:02Z · message_delivered: 1 message(s)
- 2026-11-02T19:02:02Z · note: handoff requested (cli)
- 2026-11-02T19:02:32Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 4s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-02T19:02:50Z · status active→review
- 2026-11-02T19:02:51Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-02T19:09:17Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-02T19:09:25Z · handoff failed · check failed after 2 automatic retries · reused check inputs changed during handoff — run the check again
- 2026-11-02T19:17:59Z · note: review pass 2: failed — no usable report
- 2026-11-02T19:17:59Z · needs_input
- 2026-11-02T19:51:42Z · body
- 2026-11-02T23:51:53Z · review_cli_override, review_model_override
- 2026-11-02T23:52:15Z · needs_input (review-failed) cleared for review again by hello@repoos.org
- 2026-11-02T23:56:25Z · note: review pass 3: needs some work
- 2026-11-02T23:56:26Z · status review→active
- 2026-11-03T00:07:01Z · message_queued at 2026-11-03T00:07:01.796Z
- 2026-11-03T00:07:02Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-03T00:12:01Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T00:13:27Z · body
- 2026-11-03T00:16:07Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 7s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T00:18:22Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-03T00:18:48Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-03T00:18:49Z · message_delivered: 1 message(s)
- 2026-11-03T00:19:03Z · status active→review
- 2026-11-03T00:19:04Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-03T00:22:14Z · note: review pass 4: needs some work
- 2026-11-03T00:22:14Z · needs_input
- 2026-11-03T00:32:53Z · status review→active
- 2026-11-03T01:24:21Z · note: adopted orphaned engineer pid 2214
- 2026-11-03T01:31:47Z · body
- 2026-11-03T01:35:06Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-03T01:49:09Z · body
- 2026-11-03T02:04:20Z · message_queued at 2026-11-03T02:04:20.783Z
- 2026-11-03T02:04:20Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-03T02:07:19Z · body
- 2026-11-03T02:09:20Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T02:11:40Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-03T02:11:41Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-03T02:11:41Z · message_delivered: 1 message(s)
- 2026-11-03T02:14:21Z · status active→review
- 2026-11-03T02:14:22Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-03T02:21:37Z · note: review pass 5: needs some work
- 2026-11-03T02:21:37Z · needs_input
- 2026-11-03T02:21:38Z · needs_input
- 2026-11-03T02:32:14Z · review_cli_override, review_model_override
- 2026-11-03T02:32:16Z · review_model_override
- 2026-11-03T02:32:19Z · status review→active
- 2026-11-03T03:05:58Z · message_queued at 2026-11-03T03:05:58.769Z
- 2026-11-03T03:05:59Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-03T03:18:42Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T03:51:02Z · body
- 2026-11-03T04:04:53Z · body
- 2026-11-03T04:07:48Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-03T04:07:48Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-03T04:07:48Z · message_delivered: 1 message(s)
- 2026-11-03T04:18:52Z · status active→review
- 2026-11-03T04:18:53Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-03T04:22:11Z · note: review pass 6: needs some work
- 2026-11-03T04:22:11Z · needs_input
- 2026-11-03T04:22:11Z · needs_input
- 2026-11-03T04:39:34Z · needs_input
- 2026-11-03T04:39:35Z · status review→active
- 2026-11-03T04:39:35Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-11-03T04:40:50Z · status active→ready
- 2026-11-03T04:40:50Z · engineer stopped by request
- 2026-11-03T04:40:53Z · status ready→active
- 2026-11-03T04:45:32Z · note: handoff requested (ui-review)
- 2026-11-03T04:47:35Z · CTO nudge: held — handoff gate is running
- 2026-11-03T04:54:32Z · body
- 2026-11-03T04:56:48Z · status active→review
- 2026-11-03T04:56:48Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-03T04:57:51Z · note: review pass 7: needs some work
- 2026-11-03T04:57:51Z · needs_input
- 2026-11-03T05:27:21Z · body
- 2026-11-03T05:30:54Z · needs_merge
- 2026-11-03T05:45:55Z · body
- 2026-11-03T06:02:01Z · needs_input (review-rounds-exhausted) cleared for review again by human
- 2026-11-03T06:02:41Z · note: review pass 8: good to go
- 2026-11-03T06:42:20Z · status review→active
- 2026-11-03T06:44:34Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-03T06:44:34Z · needs_input
- 2026-11-03T06:49:31Z · needs_input (review-rounds-exhausted) dismissed by hello@repoos.org
- 2026-11-03T06:49:51Z · note: handoff requested (ui-review)
- 2026-11-03T07:01:15Z · handoff failed · ui-review handoff failed at review · Engineering report including its generated change summary must contain at most 1,000 words (final report has 1103); shorten the draft and request handoff again.
- 2026-11-03T07:06:22Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-03T07:06:23Z · note: handoff requested (cli)
- 2026-11-03T07:06:23Z · body
- 2026-11-03T07:07:21Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 5s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T07:10:06Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-03T07:10:22Z · handoff failed · task-file handoff failed at review · Engineering report including its generated change summary must contain at most 1,000 words (final report has 1103); shorten the draft and request handoff again.
- 2026-11-03T07:17:39Z · CTO action: restart-stalled-agent (resume) · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed
- 2026-11-03T07:27:34Z · message_queued at 2026-11-03T07:27:34.936Z
- 2026-11-03T07:27:35Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
