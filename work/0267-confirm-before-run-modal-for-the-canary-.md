---
id: "0267"
title: Confirm-before-run modal for the canary trigger
type: feature
status: inbox
priority: p3
area: ui
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-24T15:55:05Z"
updated_at: "2026-08-24T15:58:30Z"
---
## Problem
Clicking the canary egg button in the sidebar fires the freeform task-create call immediately, with no confirmation. That's a real (billed) agent run kicked off by a misclick.

## Fix
Clicking the egg opens a modal first: explain what the canary task does (walks draft → inbox → ready → active → review → merge → done with a trivial one-line diff to src/core/canary.ts) and require a confirm before calling createFreeformTask.

See src/ui-app/src/components/Sidebar.vue (the .canary-egg button and runCanary()).

## Activity

- 2026-08-24T15:58:30Z · body
