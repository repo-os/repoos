---
id: "0115"
title: Auto-save settings changes
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-12T04:12:31Z"
updated_at: "2026-08-12T04:12:31Z"
---
## Problem

The settings page requires users to click a save button to persist changes. This differs from the agents page, which saves changes automatically.

## Desired UX

Changes made on the settings page save automatically, following the existing agents page behavior. The settings page no longer displays a save button.

## Acceptance criteria

- [ ] Changes made on the settings page are saved automatically.
- [ ] The settings page no longer displays a save button.
- [ ] Auto-save behavior is consistent with the existing agents page implementation.
- [ ] Existing settings remain editable and persist correctly.

## Notes for AI

- Use the agents page auto-save implementation as the reference pattern.
- Limit the change to replacing the settings page's manual save flow with auto-save.
- Assume all settings currently handled by the save button should participate in auto-save.

## Activity

- 2026-08-12T04:12:31Z · created · unknown
