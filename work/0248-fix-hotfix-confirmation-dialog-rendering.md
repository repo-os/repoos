---
id: "0248"
title: Fix Hotfix confirmation dialog rendering inline
type: bug
status: ready
priority: p1
area: ui
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-17T11:19:44Z"
updated_at: "2026-08-17T11:19:44Z"
---
## Problem

Clicking **Hotfix** displays the confirmation controls inline beneath the task actions instead of as a modal overlay. This makes the destructive choice look like ordinary page content and breaks the expected focus/confirmation flow.

## Reproduction

1. Open a ready task.
2. Click **Hotfix**.
3. Observe the explanatory copy and **Cancel**, **Hotfix on branch**, and **Hotfix on main** buttons rendered below the action row rather than in a centered modal with a backdrop.

## Acceptance criteria

- [ ] The Hotfix confirmation renders in a true modal overlay above the task drawer/page, with a backdrop and correct z-index.
- [ ] Keyboard focus is moved into the dialog, tab focus is contained, Escape cancels, and clicking the backdrop cancels when safe.
- [ ] The destructive **Hotfix on main** action remains visually distinct and requires the intended confirmation path.
- [ ] The dialog works in light/dark themes and narrow viewports without clipping or layout shifts.
- [ ] Add a regression test for opening and dismissing the dialog.
- [ ] repoos check passes.

## Notes

Observed during the first hotfix-flow attempt on 2026-08-17. Preserve the existing hotfix behavior; repair presentation and dialog interaction only.

## Activity

- 2026-08-17T11:19:44Z · created · unknown
