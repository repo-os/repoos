---
id: "0575"
title: All of these popups and modals seem to have the same issu…
type: feature
status: draft
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-28T13:15:47Z"
updated_at: "2026-09-28T13:15:48Z"
---
All of these popups and modals seem to have the same issue: clicks on them go past them and onto whatever is behind them triggering further actions, e.g. in this case if I click on the button it will trigger the button and also click on the opaque background thereby closing the currently open side panel, or if I click on the button over the side panel task title it will start editing the title. This is clearly a bug, the clicks should not propagate past the popup/modal, please check all popups and modals and things of this nature and make sure the clicks are not propagating past the thing.

## Original prompt

All of these popups and modals seem to have the same issue: clicks on them go past them and onto whatever is behind them triggering further actions, e.g. in this case if I click on the button it will trigger the button and also click on the opaque background thereby closing the currently open side panel, or if I click on the button over the side panel task title it will start editing the title. This is clearly a bug, the clicks should not propagate past the popup/modal, please check all popups and modals and things of this nature and make sure the clicks are not propagating past the thing.

## Screenshots

![Screenshot-2026-09-28-at-21.09.35](/api/tasks/0575/attachments/screenshot-1.png)

## Activity

- 2026-09-28T13:15:47Z · created · hello@repoos.org
- 2026-09-28T13:15:48Z · screenshots
