---
id: "0781"
title: "Easter eggs bundle: macOS Hub links with target=_blank to https sites do nothing"
type: bug
status: review
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-macos-hub-links-with-
model_override: opencode/muse-spark-1.3-contributor-free
created_at: "2026-10-14T09:07:37Z"
updated_at: "2026-10-14T10:59:31Z"
last_check_failure: "repoos check at 2026-10-14T09:33:45.789Z: repoos check failed: ui-smoke — $ bun scripts/ui-smoke.mjs"
---
## Problem
In the native macOS RepoOS Hub, links on server pages do nothing when they open a new window to an https site. Seen on the Releases page: 'Release guide', 'CI workflow', 'GitHub release' and the 'Watch the build' link.

Cause (macos/RepoOSHub/ServerNavigationPolicy.swift, decide()): when a navigation opens a new window (target=_blank, so targetFrame is nil), the policy only sends loopback http(s) links to the default browser on a user click. Every other new-window request, including https links the user clicked, returns .cancel(reason: .popup). So the click is silently dropped. The same-tab https path already opens the external-link sheet, so this only affects new-window links.

A second, separate reason the page looked dead: the Releases page belongs to a server (Divot, localhost:7405) that is offline, and the Hub shows 'This local RepoOS server is offline' over it. Starting that server is a user action, not a code fix.

## Desired UX
- A user-clicked https link that opens a new window goes through the same external-link path as a same-tab https link (the Open in browser sheet). Nothing is silently dropped.
- Non-link popups (scripted window.open with no user click) stay blocked, as today.
- The fix lives in the shared policy, so it covers every link in the Hub, not just the Releases page.

## Acceptance criteria
- Test in macos/RepoOSHubTests/ServerNavigationPolicyTests.swift: a user-clicked https new-window request returns openInDefaultBrowser; a non-user-initiated https popup still cancels with .popup.
- Existing loopback new-window test still passes.
- Manual check in the Hub: a target=_blank GitHub link opens the browser sheet.

## Notes for AI
Start from ServerNavigationPolicy.decide() and the 0d18a91c2 fix ('open loopback dev links in the browser from the Hub'), which added the loopback case. Mirror that for https. Source: user report 2026-10-14 on the Releases page and the Hub's offline-server sheet.

## Activity

- 2026-10-14T09:07:37Z · created · njachowski@gmail.com
- 2026-10-14T09:14:04Z · model_override
- 2026-10-14T09:14:05Z · status inbox→ready
- 2026-10-14T09:14:06Z · status ready→active, branch
- 2026-10-14T09:16:41Z · body
- 2026-10-14T09:40:41Z · body
- 2026-10-14T09:48:41Z · message_queued at 2026-10-14T09:48:41.489Z
- 2026-10-14T09:48:41Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-14T10:54:08Z · message_expired: not delivered within timeout
- 2026-10-14T10:59:30Z · status active→review
- 2026-10-14T10:59:31Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
