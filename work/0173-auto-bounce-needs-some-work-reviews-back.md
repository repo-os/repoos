---
id: "0173"
title: "Auto-bounce needs-some-work reviews back to the implementer (max 2 rounds, then human)"
type: feature
status: ready
priority: p2
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-08-13T14:15:52Z"
updated_at: "2026-08-13T14:15:52Z"
---
## Problem
When the reviewer agent finishes with a verdict other than `good to go`, the task sits in `review` and a human must manually forward the findings to the engineer, wait for fixes, and re-run the review. For small fixes this is pure friction. RepoOS should close the loop itself, but with a hard cap so a bad loop can never spin forever.

## Goal
After a review run completes with a non-good-to-go verdict, automatically hand the review findings back to the implementing agent (same session, same worktree), let it fix and re-handoff, then re-run the reviewer. Stop automatically after 2 fix/review rounds and require a human to step in.

## Acceptance criteria
1. When a review run finishes with verdict `needs some work` or `back to the drawing board` and round 1 is still resumable, RepoOS sends the review report (Bugs + Edge cases + Suggestions sections) to the task engineer session through the same path as POST /api/tasks/:id/message, with no human involvement.
2. A per-task review-round counter is persisted (task frontmatter, e.g. `review_rounds`) and incremented each time a full review run completes with a non-good-to-go verdict.
3. After the engineer fixes and re-handoffs (status back to review), the reviewer runs again through the normal trigger. If the new verdict is `good to go`, the loop stops and the report shows as usual.
4. When the counter reaches 2 non-good-to-go verdicts, the auto-bounce stops; the task stays in `review` with an explicit activity note that a human must step in. No further automatic messages are sent to the engineer session.
5. If the engineer session is not resumable (lost on restart), never auto-bounce — just log the note that a human must step in.
6. The reviewer itself is unchanged: read-only, never edits; human sign-off is still required to move to done. `good to go` verdicts never trigger a bounce.

## Notes
- Verdict labels are already structured in src/server/review.ts (~line 155): `good to go` / `needs some work` / `back to the drawing board`. Parse the Verdict section.
- The re-run after fixes must reuse the existing trigger (POST /api/tasks/:id/review/again, src/server/server.ts:1319).
- Reuse the existing resume-turn message path (POST /api/tasks/:id/message). This must work whether or not server-side finalization drops the handoff signal (see 0169/0172) — do not rely on the handoff signal.
- Count only full non-good-to-go review runs, not follow-up chat turns.

## Activity

- 2026-08-13T14:15:52Z · created · unknown
