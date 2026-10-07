---
id: "0713"
title: Shot captures are written untracked into the main checkout (work/.attachments) and block close-out of unrelated tasks
type: bug
status: review
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/shot-captures-are-written-untracked-into
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T09:14:53Z"
updated_at: "2026-10-07T00:17:05Z"
last_check_failure: "repoos check at 2026-10-07T00:10:23.966Z: repoos check failed: ⏭ user-docs-build — skipped — no changed path matches user-docs/** · ⏭ landing-build — skipped — no changed path matches landing/** · ⏭ telegram-manager-build — skipped — no changed path matches telegram-manager/** · ⏭ telegram-manager-test — skipped — no changed path matches telegram-manager/** · ⏭ macos-hub-icon-transparency — skipped — no changed path matches macos/RepoOSHub/Assets.xcassets/**, macos/scripts/generate-app-icons.swift, macos/scripts/verify-dock-icon-transpa… (truncated)"
---
Field report from tuk-private (RepoOS v0.5.66). Source rows in tuk-private/repoos/docs/repoos-feedback.md. Row 25. Captures should be gitignored/ignored by the dirty-main check.

## Verify first

VERIFY FIRST: in this repo .gitignore already ignores work/.attachments/ and inputs/.attachments/. The field report was a project using the repoos/ layout (repoos/work/.attachments/) whose .gitignore lacks it. Decide whether the fix is RepoOS-side (dirty-main check and close-out ignore attachment/shot dirs for ANY layout, or write captures to an already-ignored location) or init-side (#0703). Implement only the RepoOS-side guard; if it is purely project config, say so and write the test for the guard.

## Activity

- 2026-10-06T09:14:53Z · created · unknown
- 2026-10-06T09:14:54Z · needs_input
- 2026-10-06T23:52:23Z · cli_override, model_override
- 2026-10-06T23:52:26Z · status inbox→ready
- 2026-10-06T23:52:27Z · status ready→active, needs_input, branch
- 2026-10-06T23:54:58Z · body
- 2026-10-06T23:56:20Z · body
- 2026-10-06T23:57:29Z · body
- 2026-10-06T23:57:40Z · body
- 2026-10-06T23:59:38Z · body
- 2026-10-07T00:02:42Z · body
- 2026-10-07T00:04:41Z · body
- 2026-10-07T00:14:14Z · body
- 2026-10-07T00:16:04Z · body
- 2026-10-07T00:17:04Z · status active→review
- 2026-10-07T00:17:04Z · note: Task body is underspecified: missing sections: Problem, Acceptance criteria, Notes for AI
- 2026-10-07T00:17:05Z · note: shots: skipped — the diff (9 changed paths) touches no [[preview.paths]] globs — no UI change to capture
