---
id: 1008
title: Review and safely clean task worktrees
type: chore
status: review
priority: p2
area: [core, server]
assigned_to: ai
created_by: schedule
branch: feat/review-and-safely-clean-task-worktrees
cli_override: cursor
model_override: grok-4.7-low
created_at: "2026-11-01T22:00:49Z"
updated_at: "2026-11-04T23:28:37Z"
---
## Problem

RepoOS leaves a Git worktree and branch behind for every task it runs. Most are cleaned up on close-out, but over time some are left over: merged feature branches that were never collected, and worktrees whose task is done, archived or gone. These add noise and have caused confusing failures, such as close-outs that fail with "feature branch worktree not found". The cleanup must never lose work: unfinished, dirty, unmerged, held, human-owned or in-review work has to stay.

This is the recurring hygiene pass. On each run, review the registered worktrees, remove only the ones RepoOS itself proves safe to remove with its guarded `repoos gc`, and report every worktree that was kept together with the exact reason.

## Acceptance criteria

- [ ] Before changing anything, `repoos status --json` and `repoos gc --dry-run` were run, and the report records the worktree count, the safe candidates, and the protected worktrees with their reasons.
- [ ] If there are safe candidates, cleanup was done only with `repoos gc --yes`, and a second `repoos status --json` plus `repoos gc --dry-run` shows no safe candidates left (or the report says why some remain).
- [ ] If there are no safe candidates, the run changed nothing: `repoos gc --yes` was not run and no worktree or branch was removed. The report says so.
- [ ] The report lists every protected worktree with its exact reason, and the before and after counts.
- [ ] No active, review, held, human-assigned, dirty or unmerged task worktree or branch was removed, and nothing was removed by hand with `git worktree remove` or `git branch -D`.
- [ ] No product code was edited, nothing was pushed, and no unrelated task was started. The diff contains only this task's own task file and report files.

## Notes for AI

Runbook:

1. Re-read `AGENTS.md`, `repoos driver brief`, and `repoos list`. Check the live state of any task referenced by a retained worktree before judging it.
2. Run `repoos status --json` and `repoos gc --dry-run`. Record the current count, safe candidates, and protected reasons.
3. If RepoOS reports safe candidates, apply its own guarded cleanup with `repoos gc --yes`, then verify with another `repoos status --json` and `repoos gc --dry-run`.
4. Never remove a worktree or branch by hand. Never clean active, review, held, human-assigned, dirty, or unmerged task work. Do not reset task files to main based only on their path. Leave unresolved done/archived worktrees for the safety rules tracked in #1004.
5. Record before and after counts and the protected worktrees in this task's handoff report. If there are no safe candidates, report that and finish without changing anything.

Do not edit product code, push, or start unrelated tasks as part of this run.

Context: `repoos gc` is the only sanctioned way to remove worktrees and branches; it decides what is safe. Worktrees outside RepoOS's managed task-worktree directory (for example other tools' worktrees) are not this task's to remove. This task comes from the "Safe worktree cleanup" schedule in `schedules/`; a normal run has an empty code diff, so there is nothing for the scoped check to test beyond the task's own files. Once #1004 lands and changes what `repoos gc` collects, update this runbook and the schedule template to match.

## Cleanup report
Run at 2026-11-04T23:10Z from this worktree. `repoos status --json` reported 22 worktrees (19 managed). `repoos gc --dry-run` reported 0 safe candidates, 18 retained, 3 outside RepoOS's managed directory. `repoos gc --yes` was not run. Nothing was removed with `git worktree remove` or `git branch -D`. Before and after counts are the same because this run changed no worktree or branch.

Protected worktrees and the exact `repoos gc` reason:

- `feat/repoos-doctor-warn-when-macos-syspolicyd` (#0898, done) — task file content not represented in main (work/0826, work/0829, work/0833, work/0840, work/0842); 3 commits ahead.
- `feat/handoff-a-shot-whose-waitfor-click-highl` (#0830, done) — task file content not represented in main (work/0826, work/0829, work/0830, work/0833, work/0834); 1 commit ahead.
- `feat/easter-eggs-bundle-init-template-paths-s` (#1026, active) — task agent still active; 10 commits ahead.
- `feat/install-uninstall-fix-mise-path-friction` (#1025, review) — task agent still active; 5 commits ahead.
- `feat/link-telegram-chats-to-a-repository-from` — uncommitted task-file changes with unique data: work/0534-authorize-every-telegram-message-against.md.
- `feat/live-verification-of-jev-and-clef-flash-` (#0794) — human-assigned task (not resolved by close-out).
- `feat/model-list-per-cli-loading-visible-failu` — uncommitted task-file changes with unique data: work/0591-width-aware-cli-layout-shared-layout-hel.md.
- `feat/protect-a-task-worktree-from-edits-after` — uncommitted task-file changes with unique data: work/0595-failure-tl-dr-for-move-to-done-errors.md.
- `feat/remote-bundle-mirror-path-is-quoted-so-r` (#1009, active) — task agent still active; dirty `src/ui-app/tests/remote-validation.test.ts`.
- `feat/rendered-contrast-audit-across-themes-an` — uncommitted task-file changes with unique data: work/0589 and work/0592.
- `feat/repoos-check-cache-step-results-by-tree-` — task file content not represented in main: work/0652; 4 commits ahead.
- `feat/repoos-shot-capture-the-app-target-for-m` — changes not in main: src/commands/shot.ts, src/core/shot-page.ts, src/core/shot-plan.ts, src/server/shot-capture.ts; 1 commit ahead.
- `feat/review-and-safely-clean-task-worktrees` (#1008, active) — task agent still active.
- `feat/task-hold-one-durable-documented-state-t` (#0960, done) — ignored files may hold local data (`src/ui-app/.repoos/auto-engineering-decision.json`, `work/.attachments`); dirty task file.
- `feat/upload-state-retry-ux` — task file content not represented in main: work/0840; 9 commits ahead and a dirty tree.
- `feat/close-out-engineer-checkpoint-commits-af` (#0834, done) — task file content not represented in main (work/0664, work/0666, work/0826, work/0829, work/0833); 1 commit ahead.
- `feat/diagnose-4-pre-existing-full-suite-test-` (#0840, done) — task file content not represented in main (work/0664, work/0826, work/0829, work/0833, work/0840); 5 commits ahead.
- `feat/worktree-handoff-guard-false-positives-o` (#0600, done) — uncommitted task-file changes with unique data: work/0599-fix-the-gitignore-generated-by-repoos-in.md.

External, left in place: `codex/chat-diagnostics`, `codex/unsandboxed-engineering`, `codex/dependency-confirm-dialog` (outside RepoOS's managed worktree directory).

Done and archived worktrees that `repoos gc` still retains stay for the safety rules tracked in #1004. This pass did not judge them safe by hand.

## Activity

- 2026-11-01T22:00:49Z · created · schedule
- 2026-11-02T03:19:18Z · needs_input
- 2026-11-04T17:43:24Z · body: Problem (added); Acceptance criteria (added); Notes for AI (added); Purpose (removed); Runbook (removed)
- 2026-11-04T17:43:30Z · needs_input
- 2026-11-04T22:59:00Z · cli_override
- 2026-11-04T22:59:01Z · model_override
- 2026-11-04T22:59:05Z · status ready→active, branch
- 2026-11-04T23:02:05Z · body
- 2026-11-04T23:03:44Z · message_queued at 2026-11-04T23:03:44.494Z
- 2026-11-04T23:05:05Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T23:10:08Z · message_delivered: 1 message(s)
- 2026-11-04T23:10:10Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-04T23:12:45Z · body: Cleanup report (added)
- 2026-11-04T23:12:45Z · message_queued at 2026-11-04T23:12:45.945Z
- 2026-11-04T23:14:41Z · body
- 2026-11-04T23:15:20Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-04T23:15:20Z · message_queued at 2026-11-04T23:15:20.674Z
- 2026-11-04T23:15:20Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: `repoos gc` reports zero safe candidates, so this run will not remove anything. The last handoff failed because a no-op still needs `no_source_change: true`; I’ll record the protected worktrees and set that flag through the task update pat… · stderr: (empty)
- 2026-11-04T23:15:21Z · message_delivered: 2 message(s)
- 2026-11-04T23:17:42Z · body
- 2026-11-04T23:20:05Z · CTO nudge: held — handoff gate is running
- 2026-11-04T23:28:37Z · status active→review
- 2026-11-04T23:28:37Z · message_queued at 2026-11-04T23:28:37.690Z
- 2026-11-04T23:28:37Z · note: shots: skipped — the diff (2 changed paths) touches no capture target's globs — no UI change to capture
