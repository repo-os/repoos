---
id: "0624"
title: Handoff guard false-positives when main is merged into a task in review
type: bug
status: active
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: The reviewer sent this back to the engineer 2 times and still found issues. Human review needed.
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/handoff-guard-false-positives-when-main-
created_at: "2026-10-02T06:09:14Z"
updated_at: "2026-10-02T07:30:12Z"
review_passes: 3
review_rounds: 2
---
## Problem
Clicking Move to done on #0622 failed with "worktree changed after handoff: HEAD is 0c839fc2 but handoff recorded 26c37f6f" and the Worktree changed after handoff dialog. Nobody edited the task's code. HEAD moved because a clean merge of main (`merge main into feat/promote-release-failures-above-published`) was committed on the branch after handoff. It brought in already-landed main commits (d3a01d75 and the 0621 close-out) and touched 11 source files.

`verifyWorktreeHandoffIntegrity` (src/server/worktree-handoff-guard.ts) only tolerates HEAD drift when every changed path is task bookkeeping (#0600). A main-sync merge touches real source, so it is refused.

## Desired UX
A conflict-free merge of main into a task branch in review does not trip the guard. The handoff snapshot is re-recorded at the new HEAD, or the merge is recognised as safe. Move to done then proceeds, since close-out merges main into a fresh candidate worktree anyway. Real post-handoff edits (author commits or dirty files) are still refused.

## Acceptance criteria
- A merge commit whose non-first parents are all ancestors of main, and which adds no content beyond what main already contains, does not fail the guard.
- Commits or uncommitted edits that are not main-sync still fail with the existing message.
- If the check is relaxed rather than re-snapshotted, tests cover both cases in worktree-handoff-guard.test.ts.
- The dialog's Discard option stays as the fallback.

## Notes for AI
Related: #0600 (bookkeeping-only drift, uses isAncestor and pathsChangedBetweenCommits in src/core/git.ts). Discard runs git reset --hard to the snapshot SHA in the feature worktree only, never on main. Consider who creates the sync merge (a sync with main action while in review) and whether it should refresh the snapshot itself instead.

## Activity

- 2026-10-02T06:09:14Z · created · unknown
- 2026-10-02T06:09:22Z · status inbox→ready
- 2026-10-02T06:09:22Z · status ready→active, branch
- 2026-10-02T06:24:24Z · status active→review
- 2026-10-02T06:24:25Z · note: shots: skipped — the diff (5 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-02T06:25:41Z · status review→active
- 2026-10-02T06:53:20Z · status active→review
- 2026-10-02T06:53:20Z · note: shots: skipped — the diff (5 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-02T06:54:07Z · status review→active
- 2026-10-02T07:10:27Z · status active→review
- 2026-10-02T07:10:27Z · note: shots: skipped — the diff (5 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-02T07:12:19Z · needs_input
- 2026-10-02T07:14:31Z · status review→active
- 2026-10-02T07:14:31Z · note: interactive session: fixing round-3 review bugs (post-handoff commit reachable from main; octopus sync merges)
- 2026-10-02T07:26:14Z · status active→review
- 2026-10-02T07:26:14Z · status review→active
- 2026-10-02T07:30:12Z · note: shots: skipped — the diff (5 changed paths) touches no [[preview.paths]] globs — no UI change to capture
