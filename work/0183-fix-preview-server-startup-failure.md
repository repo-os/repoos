---
id: "0183"
title: Fix preview server startup failure
type: bug
status: active
priority: p1
area: core
assigned_to: unassigned
created_by: ""
branch: feat/fix-preview-server-startup-failure
model_override: default
created_at: "2026-08-13T23:57:56Z"
updated_at: "2026-08-15T15:31:14Z"
---
## Problem

Preview links have stopped working. The preview server for task #0182 failed to become ready, blocking preview functionality. This is a regression — the feature was previously working but has broken.

## Desired UX

- Preview server successfully starts and reaches ready state
- Preview links are functional and accessible
- Users can preview their work without startup errors

## Acceptance Criteria

- [ ] Identify why the preview server failed to become ready for #0182
- [ ] Locate and fix the root cause
- [ ] Verify the preview server successfully starts and becomes ready
- [ ] Confirm preview links work as expected
- [ ] Test fix against task #0182 and other tasks to ensure preview functionality is restored

## Notes for AI

- This is a regression; check recent changes to preview server startup/initialization code
- Task #0182 provides a concrete reproduction case for investigation
- Focus on the preview server readiness logic and startup sequence
- Check server logs for specific error messages related to startup failure

## Related

- #0182

## Activity

- 2026-08-13T23:57:56Z · created · unknown
- 2026-08-13T23:58:25Z · status inbox→ready
- 2026-08-14T03:33:21Z · status ready→active, branch
- 2026-08-14T07:42:24Z · watchdog: auto-surfaced stuck task · status active→ready · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-08-15T04:15:24Z · status ready→active
- 2026-08-15T04:57:15Z · status active→ready
- 2026-08-15T04:57:17Z · status ready→active
- 2026-08-15T15:31:14Z · model_override
