---
id: "0146"
title: "bug: preview banner isn't showing in the right place, it'…"
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/bug-preview-banner-isn-t-showing-in-the-
created_at: "2026-08-12T14:19:58Z"
updated_at: "2026-08-12T18:11:32Z"
---
## Description

The preview banner that indicates a preview build of the repoos UI is not displaying in the correct location. It should appear in the upper left corner of the UI, but currently it's appearing inconsistently on task cards when they're in the review state.

## Expected Behavior

- Preview banner should display prominently in the upper left corner of the repoos UI
- It should be visible at all times when running a preview build
- The banner should not appear on individual task cards

## Actual Behavior

- Preview banner is appearing on task cards when they're in review state
- Banner is not consistently visible in the upper left corner
- Placement is incorrect and inconsistent across the UI

## Steps to Reproduce

1. Build and run a preview version of the repoos UI
2. Navigate through the application
3. Observe that the preview banner appears on task cards in review state instead of the upper left corner

## Acceptance Criteria

- [ ] Preview banner displays in the upper left corner of the main UI
- [ ] Banner is visible consistently throughout the application
- [ ] Banner does not appear on individual task cards
- [ ] Banner styling is appropriate for a preview build indicator

## Activity

- 2026-08-12T14:19:58Z · created · unknown
- 2026-08-12T18:00:29Z · status draft→review, branch
- 2026-08-12T18:11:32Z · status review→done, release:success
