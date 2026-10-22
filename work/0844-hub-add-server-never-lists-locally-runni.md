---
id: "0844"
title: "Hub: Add server never lists locally running RepoOS servers (discovery probe times out)"
type: bug
status: done
priority: p2
area: macos
merged_commit: aaa2d0daa8a50b5f20bf057fdfed031a8a4b0988
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/hub-add-server-never-lists-locally-runni
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-19T05:15:39Z"
updated_at: "2026-10-22T14:02:59Z"
last_close_out_gate_ms: 94623
last_close_out_gate_at: "2026-10-19T06:11:03.958Z"
review_passes: 3
review_rounds: 2
---
## Problem
In RepoOS Hub, **Add server** is meant to show a "Running locally" list of RepoOS instances (LocalServerDiscovery.swift, added in d76dbd24c) so you can click one to add it. In practice the sheet shows the spinner for about a second and then nothing appears, even with servers clearly running (reported 2026-10-19: a new project on http://127.0.0.1:7559/ never shows, while 7171 is also up).

Reproduced outside the app with the same approach as `LocalServerDiscovery.discover`: 1000 ports (7000-7999) probed concurrently, each with its own ephemeral `URLSession` and a **0.4 s** `timeoutIntervalForRequest`/`ForResource`:
- 0.4 s timeout: found **[]** (three runs out of three), finishing in about 0.4-0.6 s, even though `curl` gets the health response from 7559 in about 33 ms.
- 2.0 s timeout: found [7171, 7405, 7559, 7845] in two of three runs, [] in the third.
So the probe is not reliable: creating a thousand sessions at once means requests spend most of their 0.4 s budget queueing, and the resource timeout fires before the connection is even attempted. The health endpoint itself is fine (`GET /api/health` -> 200 `{"ok":true,...}`).

## Desired UX
- Opening **Add server** reliably lists every locally running RepoOS server (not already added) within about a second or two, with the project name, so a click fills the URL.
- Do not depend on a brute-force 1000-port scan racing a tiny timeout.

## Acceptance criteria
- Discovery uses bounded concurrency (for example 32-64 probes in flight) with **one shared** URLSession, and a realistic per-probe timeout (about 1-1.5 s) so loaded machines still work; a port that refuses the connection fails instantly and does not count against the budget.
- Prefer a cheap, authoritative source first if one exists (for example a registry of running servers or the listening-socket list for ports 7000-7999) and fall back to the scan; document which.
- Retry a probe once on timeout (not on connection refused) so a momentarily busy server is still found.
- Servers already added in the Hub are still excluded; ports are listed in ascending order; a slow or hung server cannot block the list indefinitely (overall deadline with partial results shown as they arrive).
- Unit tests in RepoOSHubTests with a fake health checker: finds servers under simulated latency (the case that failed before), respects bounded concurrency, excludes known ports, handles refused/timeouts, and shows partial results.
- Manual check recorded in the task: with a local `repoos serve` on a non-default port (for example 7559), the Add server sheet lists it and a click fills `localhost:<port>`.

## Notes for AI
Start from macos/RepoOSHub/LocalServerDiscovery.swift, ServerEditorSheet.swift (runDiscovery and LocalDiscoverySection) and HealthCheckService.swift. The repro harness is a ~30-line Swift script (TaskGroup over 7000...7999 with ephemeral sessions); recreate it to confirm the fix. Build with xcodebuild for the Hub scheme and run the Hub unit tests; no device or signing needed. Do not touch repoos.toml. Source: Nick, 2026-10-19, screenshot of the Add server sheet.

## Manual check
With a local `repoos serve` on a non-default port (e.g. **7559**), open Hub → **Add server** and confirm:

1. **Running locally** lists the instance (project name + `localhost:7559`).
2. Clicking **+** fills the Server URL field with `localhost:7559`.

### Recorded verification

- **2026-10-19 — PASS (discovery + lsof path):** On this machine with `repoos serve` on **7559** (`lightingai`), `LocalServerDiscoveryTests.testLiveDiscoveryFindsLocalRepoOSWhenServingOn7559` passed: `lsof` enumerated the listener and `LocalServerDiscovery.discover(knownLocalPorts: [])` returned `localhost:7559` with the health-reported project name.
- **2026-10-19 — Hub UI (+ click):** Not clicked in this automated run; the sheet uses the same `discover` API and sets `draft.originText = server.originString` on **+** (`ServerEditorSheet`). Confirm in Hub when signing off if you want a full UI pass.

## Activity

- 2026-10-19T05:15:39Z · created · njachowski@gmail.com
- 2026-10-19T05:15:51Z · status inbox→ready
- 2026-10-19T05:15:56Z · cli_override, model_override
- 2026-10-19T05:15:58Z · status ready→active, branch
- 2026-10-19T05:19:20Z · body
- 2026-10-19T05:26:59Z · status active→review
- 2026-10-19T05:27:00Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-19T05:27:45Z · note: review pass 1: needs some work
- 2026-10-19T05:27:46Z · status review→active
- 2026-10-19T05:28:30Z · body: Manual check (added)
- 2026-10-19T05:28:30Z · message_queued at 2026-10-19T05:28:30.974Z
- 2026-10-19T05:29:11Z · body
- 2026-10-19T05:36:08Z · status active→review
- 2026-10-19T05:36:09Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-19T05:37:08Z · note: review pass 2: needs some work
- 2026-10-19T05:37:08Z · message_delivered: 1 message(s)
- 2026-10-19T05:37:08Z · status review→active
- 2026-10-19T05:38:13Z · body: Manual check (added 3, removed 1)
- 2026-10-19T05:38:13Z · message_queued at 2026-10-19T05:38:13.516Z
- 2026-10-19T05:39:03Z · body
- 2026-10-19T05:45:39Z · status active→review
- 2026-10-19T05:45:40Z · note: shots: skipped — the diff (7 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-19T05:46:33Z · note: review pass 3: good to go
- 2026-10-19T06:11:03Z · close-out gate completed in 95s
- 2026-10-19T06:11:07Z · status review→done, release:success
- 2026-10-19T06:42:11Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T07:51:21Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T13:55:06Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T14:51:11Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T15:43:30Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T16:19:54Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T19:46:47Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T04:26:29Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T11:08:20Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T15:31:56Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T16:09:58Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T17:21:45Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T18:33:40Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T19:47:05Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T20:10:43Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T21:10:04Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T21:57:01Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T22:12:32Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T23:15:29Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T23:17:43Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T00:05:52Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T01:05:51Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T02:04:02Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T04:15:07Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T08:22:54Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T11:51:32Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T11:59:35Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T13:14:35Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T14:32:41Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T16:04:32Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T16:53:28Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T18:00:35Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T18:10:51Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T18:42:36Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T19:37:30Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T01:39:27Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T01:48:04Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T02:15:35Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T04:26:34Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T07:48:48Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T08:39:37Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T11:36:29Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T14:02:59Z · message_overdue: still queued after 60m without being delivered
