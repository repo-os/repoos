---
id: "0692"
title: "Faster, rarer close-out merge conflicts: auto-resolve mechanical conflicts, skip re-handoff and re-review after a conflict-only merge"
type: feature
status: inbox
priority: p2
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T23:52:38Z"
updated_at: "2026-10-05T23:52:47Z"
---
## Problem

When close-out hits a merge conflict, the task goes back to an engineer agent: a fresh agent session starts, merges main into the branch, resolves, reruns the full gate (5+ min under load), the branch tip then differs from the recorded handoff sha so close-out refuses it until the task is handed off again, a new review pass runs, and only then does Move to done queue. That is two agent sessions plus a gate run (15-30 min under load) for what is often a mechanical conflict. Observed overnight 2026-10-06: tasks 0673, 0687, 0690 and 0659 each went through it (conflicts in config.ts, types.ts, configuration.md, notifications.test.ts, all hot shared files) and 0673 and 0690 each needed a manual mv active/review re-handoff.

## Desired UX

- Auto-resolve mechanical conflicts without an agent: append-only/union conflicts in docs, task and test lists, and non-overlapping hunks in the same file; fall back to the engineer only for real code conflicts.
- Treat a conflict-resolution merge as bookkeeping for the handoff-sha check: the existing check already accepts a conflict-free merge that equals a merge-tree replay; extend that so an auto-resolved merge (recorded by RepoOS itself) also passes without a re-handoff.
- Skip the re-review after a conflict-only merge when the resolved diff touches no lines outside the conflict regions; only rerun the gate.
- Sync main into the branch just before handoff so conflicts surface while the engineer has context.
- Show on the task which of these happened (auto-resolved, handed back, re-reviewed) and how long each step took.

## Acceptance criteria

- Tests: a docs/test-list append conflict resolves automatically and closes out without an agent turn; a real code conflict still goes to the engineer; an auto-resolved merge does not trigger the handoff-sha refusal; a conflict-only merge does not trigger a re-review.
- Docs: docs/close-out-pipeline.md and user-docs/review-and-close-out.md updated. repoos check passes.

## Notes for AI

Overlaps with #0679 (hand merge/semantic conflicts back to the engineer automatically): read it first, build on it, and do not duplicate it; this task is about avoiding the engineer round-trip when it is not needed. See the Docs-follow-up convention in the story.

## Activity

- 2026-10-05T23:52:38Z · created · unknown
- 2026-10-05T23:52:47Z · story
