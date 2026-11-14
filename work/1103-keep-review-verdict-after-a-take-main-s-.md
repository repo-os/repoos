---
id: "1103"
title: Keep review verdict after a take-main's-side merge-conflict fix
type: feature
status: active
priority: p2
area: [web, server]
assigned_to: ai
created_by: t@t
branch: feat/keep-review-verdict-after-a-take-main-s-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T01:19:52Z"
updated_at: "2026-11-14T03:36:52Z"
handoff_signal_retry_count: 1
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

## Notes for AI
Start from the close-out failure card component and `repoos landable` review-lock check. Reuse the existing merge-base/merge-tree helpers in src/core/git.ts rather than shelling out ad hoc.

## Activity

- 2026-11-14T01:19:52Z · created · t@t
- 2026-11-14T01:19:53Z · needs_input
- 2026-11-14T01:19:56Z · body: Notes for AI (added)
- 2026-11-14T01:46:15Z · needs_input
- 2026-11-14T03:28:38Z · cli_override, model_override
- 2026-11-14T03:28:45Z · status inbox→ready
- 2026-11-14T03:28:46Z · status ready→active, branch
- 2026-11-14T03:29:52Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I haven’t implemented the task or run the required check, so I can’t request handoff. The key safety rule still needs a precise implementation: prove that the branch tip after the conflict resolution contains no changes beyond the reviewed… · stderr: Reading additional input from stdin...
- 2026-11-14T03:36:52Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The task is still incomplete, so I’m not sending the handoff signal. I added a conservative take-main merge classifier and two focused tests, but haven’t wired them into the server route, review lock update, close-out flow, CLI, or UI. The… · stderr: Reading additional input from stdin...
