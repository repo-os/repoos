---
id: "1103"
title: Keep review verdict after a take-main's-side merge-conflict fix
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Notes for AI"
priority: p2
area: [web, server]
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-14T01:19:52Z"
updated_at: "2026-11-14T01:19:53Z"
---
## Problem
After a close-out merge conflict is resolved by merging main into the task branch, the branch tip moves, the review lock sha no longer matches, and `repoos landable` fails with "Review lock". The human must wait for a full re-review even when the resolution only took main's side of a file (e.g. a comment wording clash, #1081) and added nothing new to judge.

## Desired UX
On the close-out failure card (merge conflict) and the Debug tab, after the conflict is resolved, a "Keep review verdict and merge" button appears when the resolution is provably safe: the new merge commit changes the branch vs the reviewed sha only by taking main's version of the conflicting files (the branch-vs-reviewed-sha diff, minus main's own changes, is empty). Clicking it re-pins the review lock to the new tip, records the reason in the task history, and proceeds to close-out. CLI parity: `repoos review keep <id>`. If the resolution is not provably take-main, the button is absent and the normal Review again flow applies.

## Acceptance criteria
1. A server check classifies a post-review merge commit as take-main-only vs other, with tests for both.
2. The button and `repoos review keep <id>` only work for take-main-only; otherwise they refuse with the reason.
3. The lock re-pin is recorded in task history with the old and new sha.
4. `repoos landable` passes after keeping the verdict.
5. UI follows AGENTS.md conventions (shared dialogs, no native confirm).

## Notes
Related to the narrow conflict resolution allowlist in `src/server/conflict-resolution.ts`; do not widen that allowlist. Add the CLI command to the API route parity list.

## Activity

- 2026-11-14T01:19:52Z · created · t@t
- 2026-11-14T01:19:53Z · needs_input
