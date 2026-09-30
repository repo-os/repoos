---
updated_at: "2026-09-30T06:06:02Z"
review_passes: 1
id: "0597"
title: Land 0594 shot follow-up fixes (cherry-pick 2849bdf0)
type: fix
status: review
priority: p2
area: [core, server]
assigned_to: ai
created_by: ""
branch: feat/land-0594-shot-follow-up-fixes-cherry-pi
cli_override: cursor
model_override: composer-2.5
review_model_override: opencode-go/hy3
created_at: "2026-09-30T05:01:26Z"
---
Follow-up to #0594. After #0594's handoff, four files were edited in its worktree during close-out and never committed, so they didn't land (see the close-out 'kept a worktree with uncommitted changes' note). They are committed on branch feat/repoos-shot-capture-the-app-target-for-m as 2849bdf0. Cherry-pick that commit onto this task's branch (`git cherry-pick 2849bdf0`), run `bun run fmt` and `repoos check --changed main`, then hand off. Do not re-derive the changes.

## What the commit fixes
- src/core/shot-plan.ts: the 'a step needs exactly one of click/fill/waitFor/waitMs' error had an operator-precedence bug (`a + b || c + d`), so the message was malformed. Also the ## Shots section end-heading regex now tolerates the same spacing as the start rule.
- src/server/shot-capture.ts: every skipped/failed message was double-prefixed ('shots: skipped — skipped — …'); call sites now pass the bare detail and finish() adds the prefix once. Drops an unused viewport option.
- src/core/shot-page.ts, src/commands/shot.ts: remove the unused ShotCaptureOptions.viewport field and its callers.

## Acceptance
- [ ] Step-error message reads correctly for zero keys and for multiple keys (add a test).
- [ ] Auto-capture skip/failure notes carry exactly one 'shots: <status> — ' prefix (add a test on finish()/runAutoShotCapture output).
- [ ] After this lands, remove the leftover #0594 worktree.

## Activity

- 2026-09-30T05:01:26Z · created · unknown
- 2026-09-30T05:53:56Z · cli_override, model_override
- 2026-09-30T05:53:57Z · model_override
- 2026-09-30T05:54:21Z · review_model_override
- 2026-09-30T05:54:22Z · status inbox→ready
- 2026-09-30T05:54:26Z · status ready→active, branch
- 2026-09-30T06:03:48Z · status active→review

