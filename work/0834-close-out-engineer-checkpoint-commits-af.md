---
id: "0834"
title: "Close-out: engineer checkpoint commits after handoff trigger an automatic re-review of the delta, not a hard error"
type: feature
status: inbox
priority: p2
area: core
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-18T09:09:05Z"
updated_at: "2026-10-18T09:09:05Z"
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
