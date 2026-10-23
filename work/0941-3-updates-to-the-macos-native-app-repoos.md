---
updated_at: "2026-10-23T18:40:13Z"
review_passes: 1
id: "0941"
title: Polish macOS native app tab bar
type: feature
status: review
priority: p2
area: macos
assigned_to: ai
created_by: hello@repoos.org
branch: feat/polish-macos-native-app-tab-bar
created_at: "2026-10-23T17:20:56Z"
---
## Problem

The macOS native app’s top bar is taller than the PWA’s, and its three traffic-light buttons are not vertically centered like the PWA’s. The tab bar also lacks the rounded, flared styling shown in the Chrome reference, and the down chevron has no hover response and feels cramped between the traffic-light buttons and tabs. Tabs cannot be dragged to reorder, unlike items in the sidebar.

## Desired UX

The native app’s top bar is shorter and visually aligned with the PWA example, with the three traffic-light buttons vertically centered. Tabs use rounded, flared styling inspired by the Chrome reference, including an appropriate hover treatment. The down chevron responds on hover and has comfortable spacing on both sides. Tabs can be dragged to reorder.

## Acceptance criteria

- [ ] Reduce the native app top bar height to match the PWA example.
- [ ] Vertically center the three traffic-light buttons in the top bar.
- [ ] Apply rounded, flared tab styling inspired by the Chrome reference.
- [ ] Add a hover treatment for other tabs.
- [ ] Make the down chevron respond visibly on hover.
- [ ] Increase spacing around the down chevron so it does not look cramped between the traffic-light buttons and tabs.
- [ ] Allow tabs to be dragged to reorder.

## Notes for AI

- Use the PWA and Chrome examples referenced in the request as visual guidance.
- Reuse the sidebar’s existing drag-to-reorder behavior or patterns where appropriate.
- The exact dimensions and styling details are not specified; use reasonable visual judgment to match the references.

## Original prompt

3 updates to the  macos native app repooshub:
- make the top bar shorter, to match the height of the pwa version (shown just to the left of the repoos hub topbar screenshot) and the 3 tricolor buttons at the left of the bar should be vertically centered (again, like the repoos pwa example in the screenshot)
- see if you can copy the roundedness/flaring styling of chrome (green/white screenshot) as well as on hover over other tabs and the chevron down arrow which we also have (now hover on the down chevron doesn't do anything, and anyway it's too crammed in between the tricolor buttons and tabs, let it breath, give it enough spacing on either side so it doesn't look cramped)
- make the tabs draggable to reorder them (this already is the functionality on the sidebar fyi)

## Screenshots

![Screenshot-2026-10-24-at-01.13.56](/api/tasks/0941/attachments/att_25f6ff06-7ca3-4f89-8b1c-73c40b855fa3.png)
![Screenshot-2026-10-24-at-01.14.27](/api/tasks/0941/attachments/att_3c40989e-97d0-467c-8de4-135dd43080fb.png)
![Screenshot-2026-10-24-at-01.18.06](/api/tasks/0941/attachments/att_fd1b805d-1c23-40c0-b065-e89649e611ef.png)

## Activity

- 2026-10-23T17:20:56Z · created · hello@repoos.org
- 2026-10-23T17:21:06Z · screenshots
- 2026-10-23T17:21:06Z · screenshots
- 2026-10-23T17:21:07Z · screenshots
- 2026-10-23T17:21:36Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
- 2026-10-23T18:11:20Z · status inbox→ready
- 2026-10-23T18:11:23Z · status ready→active, branch
- 2026-10-23T18:18:14Z · message_queued at 2026-10-23T18:18:14.308Z
- 2026-10-23T18:18:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-23T18:18:30Z · body
- 2026-10-23T18:21:31Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-23T18:24:27Z · body
- 2026-10-23T18:26:37Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-23T18:26:37Z · message_delivered: 1 message(s)
- 2026-10-23T18:28:47Z · body
- 2026-10-23T18:38:41Z · status active→review
- 2026-10-23T18:38:43Z · note: shots: skipped — the diff (2 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-23T18:40:12Z · note: review pass 1: good to go

