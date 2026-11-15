---
id: "1127"
title: "RepoOS Hub mobile: find RepoOS servers on my tailnet via a trusted server"
type: feature
status: active
priority: p2
area: [mobile, core]
story: RepoOS Hub for Mobile
assigned_to: ai
created_by: t@t
branch: feat/repoos-hub-mobile-find-repoos-servers-on
created_at: "2026-11-15T12:54:17Z"
updated_at: "2026-11-15T14:05:20Z"
---
## Problem
RepoOS Hub for Android/iOS (`mobile/`) only knows about servers the user types in by hand as HTTPS URLs. Nick runs several RepoOS servers across his Tailscale tailnet (e.g. bee and thinkpad, each with several project servers on ports like 7499/7819/7578) and has to add each one manually on his phone.

The CLI can already discover them: `repoos servers --tailscale` (`collectTailnetServers` in `src/commands/servers.ts`) runs `tailscale status --json` to list peers, then SSHes into each peer and runs `repoos servers --json`. The phone can't reuse that directly: an Android/iOS app can't run the Tailscale CLI or read the Tailscale app's peer list, and Hub has no SSH access or keys. `docs/mobile-architecture.md` also says "No server discovery" today, so the phone must not scan the network.

## Desired UX
1. After adding one server it trusts (e.g. `https://bee.tailc0c173.ts.net:7499`), the user taps **Find servers on my tailnet** in Hub's server picker.
2. Hub asks that one server, over its existing HTTPS session, for the RepoOS servers it can see on the tailnet.
3. Hub lists the results (host, project name, URL, and reachable or unreachable), marking any already saved. The user picks which ones to add, and each still goes through the existing HTTPS reachability check (`mobile/src/reachability.ts`) before it's saved.
4. If the server's host has no Tailscale CLI, or discovery is turned off, Hub shows a plain message and keeps manual add working as it does now.

## Acceptance criteria
- A new authenticated server endpoint (e.g. `GET /api/servers/tailnet`) returns the same data as `repoos servers --tailscale --json`, built from the existing `collectTailnetServers` and not a second copy of it. Unauthenticated requests are refused the same way the other `/api/*` routes are.
- Each result includes a URL the phone can open (an HTTPS MagicDNS URL when the server is served over HTTPS), so Hub never has to build URLs from raw IPs.
- The endpoint has a timeout and returns partial results with per-host `unreachable` and `reason`. One slow host can't hang the request.
- Hub gets a "Find servers on my tailnet" action that calls the endpoint on the selected server, shows a multi-select list, skips duplicates, and saves picks through the existing reachability-gated add flow. Nothing is saved without the user choosing it.
- The phone itself still sends no scans or broadcasts. Its only new outbound request is the one call to a server the user already trusts.
- `docs/mobile-architecture.md` is updated: the "No server discovery" line becomes a description of this server-assisted, user-triggered import and its privacy properties.
- Tests: an endpoint test with a faked `tailscaleStatus`/`remoteExec` (following `src/commands/servers.test.ts`), and a mobile unit test for de-duplicating and merging results into the saved list.
- New config keys (e.g. a switch to turn discovery off) get a Settings control, a `getConfigSchema()` entry, an entry in the supported-keys list, and docs.

## Notes for AI
- Reuse `collectTailnetServers` and `parseTailnetPeers` from `src/commands/servers.ts`. Move shared logic into `src/core/` if the server needs it, instead of shelling out to the CLI.
- Register the route next to the other `/api/*` routes in `src/server/server.ts`.
- Mobile code lives in `mobile/src/`. The server list is stored with `@capacitor/preferences`; follow the existing add flow and reachability check there.
- Real-device testing on Nick's phone is a human step. Don't claim a device session happened.

## Activity

- 2026-11-15T12:54:17Z · created · t@t
- 2026-11-15T13:16:13Z · status inbox→ready
- 2026-11-15T13:16:15Z · status ready→active, branch
- 2026-11-15T13:45:20Z · message_queued at 2026-11-15T13:45:20.238Z
- 2026-11-15T13:45:20Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T13:48:24Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T13:48:24Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Implementation and focused tests are green. Now I'll run the scoped check gate for the whole change. · stderr: (empty)
- 2026-11-15T13:48:24Z · message_delivered: 1 message(s)
- 2026-11-15T13:50:20Z · message_queued at 2026-11-15T13:50:20.524Z
- 2026-11-15T13:50:20Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T13:53:24Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T13:53:24Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Implementation and focused tests are green. Now I'll run the scoped check gate for the whole change. · stderr: (empty)
- 2026-11-15T13:53:24Z · message_delivered: 1 message(s)
- 2026-11-15T13:55:20Z · message_queued at 2026-11-15T13:55:20.552Z
- 2026-11-15T13:55:20Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T14:00:20Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T14:00:39Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T14:00:39Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: The first scoped check failed only on the UI smoke step. I'll reproduce that locally to see the actual error rather than guess. · stderr: (empty)
- 2026-11-15T14:00:39Z · message_delivered: 1 message(s)
- 2026-11-15T14:05:20Z · message_queued at 2026-11-15T14:05:20.604Z
