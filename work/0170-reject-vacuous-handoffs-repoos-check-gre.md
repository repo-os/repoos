---
id: "0170"
title: "Reject vacuous handoffs: repoos check green with zero source changes"
type: bug
status: inbox
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-13T13:50:48Z"
updated_at: "2026-08-13T13:50:48Z"
---
## Problem

On #0112 the agent reported 'task complete', emitted `::repoos-handoff-ready::`, and its own `repoos check` passed — but its worktree contained zero source changes (only regenerated `dist/` artifacts). The check passed vacuously because nothing changed. A hallucinating or stuck agent can therefore hand off an empty branch and the gate will bless it, moving an unimplemented task to review.

## Desired UX

A handoff with no real work behind it is impossible. Before accepting a handoff, the finalization (or `repoos check` itself) detects that the branch has no source changes relative to its base and rejects it with a clear reason ('no implementation found — nothing committed on the branch since <base>'), so the agent must actually write code.

## Acceptance criteria

- [ ] `repoos check` (or the handoff validate/commit step) reports a distinct, actionable failure when there are no source changes to commit (excluding `dist/`, `screenshots/`, and task-file churn).
- [ ] The failure is recorded in the transcript and the task stays active with the reason.
- [ ] Dist-only changes (regenerated build artifacts) do not count as implementation.
- [ ] A legitimate no-op task (e.g. docs-only) has an explicit escape hatch rather than being blocked forever.
- [ ] A regression test asserts the empty-branch rejection, and `repoos check` passes.

## Notes for AI

- The worktree diff to examine is against the task's branch base (where the branch was cut from main), not against main, so unrelated main drift does not false-positive.
- The escape hatch could be a frontmatter flag or an explicit agent note ('no source change required: ...').

## Activity

- 2026-08-13T13:50:48Z · created · unknown
