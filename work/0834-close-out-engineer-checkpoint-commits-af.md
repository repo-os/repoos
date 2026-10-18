---
id: "0834"
title: "Close-out: engineer checkpoint commits after handoff trigger an automatic re-review of the delta, not a hard error"
type: feature
status: active
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-engineer-checkpoint-commits-af
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T09:09:05Z"
updated_at: "2026-10-18T09:53:08Z"
dev_error_count: 1
---
## Problem
Move to done refuses with "worktree changed after handoff: HEAD is X but handoff recorded Y" whenever the branch HEAD moves after handoff, and the only recovery is a person: discard the edits or send the task back to the engineer (seen on #0832, 2026-10-18). The guard is right in principle (close-out must merge only the reviewed commit; incident #0594), but the common cause is benign: the engineer's own WIP self-check checkpoint commit (a few fixture/test files) landing after the review passed, and the task then sits in review with no engineer and no signal.

## Desired UX
When the only commits after the recorded handoff sha are RepoOS/engineer checkpoint commits (`WIP: engineer self-check checkpoint (#id)`) and the worktree is clean, Move to done does not hard-fail. Instead RepoOS automatically re-runs the handoff on the new HEAD (gate + shots) and a review pass scoped to the delta since the approved sha (reuse the narrow-resolution "review only the delta" machinery from #0692), then resumes the authorized Move to done if that pass is good to go. Any other post-handoff change (dirty tree, non-checkpoint commit, mixed drift) keeps today's hard error with a clearer message that says what to do.

## Acceptance criteria
- Test: HEAD ahead of the lock by one checkpoint commit -> automatic delta re-review is queued, the task is not left silently in review, and the original review stays tied to its commit.
- Test: a dirty worktree or a non-checkpoint commit still refuses with the existing error.
- Test: a delta review that fails sends the task back to active with the findings, like a normal needs-some-work verdict.
- docs/close-out-pipeline.md and user-docs/review-and-close-out.md updated; AGENTS.md "Interactive sessions" paragraph on post-handoff edits updated to match.

## Notes for AI
Never widen what counts as benign without a test; fail closed. Look at src/core/close-out-failure.ts, src/server/integration-orchestrator.ts, and src/server/conflict-resolution.ts for the existing guard and delta-review path. Source: driver discussion 2026-10-18 (#0832).

## Activity

- 2026-10-18T09:09:05Z · created · njachowski@gmail.com
- 2026-10-18T09:09:22Z · status inbox→ready
- 2026-10-18T09:09:37Z · cli_override, model_override
- 2026-10-18T09:09:42Z · status ready→active, branch
- 2026-10-18T09:10:15Z · agent exited with an error (cursor) · Error: [unavailable] read ETIMEDOUT
- 2026-10-18T09:35:33Z · needs_input
- 2026-10-18T09:53:07Z · message_queued at 2026-10-18T09:53:07.826Z
- 2026-10-18T09:53:08Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
