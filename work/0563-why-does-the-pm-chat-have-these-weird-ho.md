---
updated_at: "2026-09-28T00:42:31Z"
review_passes: 1
id: "0563"
title: Remove horizontal separators from all AI chats
type: feature
status: review
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: feat/remove-horizontal-separators-from-all-ai
pm_cli_override: cursor
pm_model_override: composer-2.5
created_at: "2026-09-28T00:04:51Z"
---
## Problem

Horizontal lines are appearing between consecutive messages in the PM chat. The issue is visible in the PM tabs on both the task and story panels (see the attached screenshot). Remove these unintended separators from AI chats throughout the app, not just from those two panels.

## Scope

Trace the source of the lines through the chat message rendering and styling. Apply the fix at the shared chat component or shared styling layer where possible, and check every AI-chat surface that uses it. Avoid a broad CSS reset that could remove intentional dividers elsewhere in the UI.

Keep the existing message content, speaker distinction, timestamps, and readable spacing/layout intact. The fix should remove only the unwanted horizontal rules/borders between chat messages.

## Acceptance criteria

- No horizontal line or rule is visible between consecutive messages in the task-panel PM chat or story-panel PM chat.
- Other AI chats across all pages and tabs use the same corrected behavior; the fix is not limited to the two reported panels.
- Existing message layout and readability remain intact, and intentional dividers outside chat message lists are unaffected.
- Add or update suitable regression coverage for the shared chat rendering/styling if the existing test setup supports it.
- Rebuild the UI and run relevant checks/tests for the change.

## Original prompt

why does the pm chat have these weird horizontal lines between chat messages (seen on stories and tasks panel pm tab). please remove them and make sure they don't come back in any of the ai chats on any page/tab.

## Screenshots

![Screenshot-2026-09-28-at-08.03.08](/api/tasks/0563/attachments/screenshot-1.png)

## Activity

- 2026-09-28T00:04:51Z · created · hello@repoos.org
- 2026-09-28T00:04:52Z · screenshots
- 2026-09-28T00:07:51Z · note: Freeform PM run failed: the opencode agent timed out after 180s
- 2026-09-28T00:07:52Z · needs_input
- 2026-09-28T00:09:23Z · pm_cli_override, pm_model_override
- 2026-09-28T00:09:26Z · pm_cli_override
- 2026-09-28T00:09:29Z · needs_input
- 2026-09-28T00:10:00Z · title, body
- 2026-09-28T00:15:40Z · status draft→inbox
- 2026-09-28T00:15:40Z · needs_input
- 2026-09-28T00:15:46Z · status inbox→ready
- 2026-09-28T00:16:17Z · status ready→active, needs_input, branch
- 2026-09-28T00:29:30Z · status active→review
- 2026-09-28T00:35:03Z · pm_cli_override
- 2026-09-28T00:35:07Z · pm_model_override

