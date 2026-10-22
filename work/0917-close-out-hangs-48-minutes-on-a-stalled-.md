---
id: "0917"
title: Close-out hangs ~48 minutes on a stalled ssh bundle upload before falling back to local; thinkpad swap full again
type: feature
status: active
priority: p1
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-hangs-48-minutes-on-a-stalled-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-22T04:09:06Z"
updated_at: "2026-10-22T11:36:26Z"
---
## Problem
2026-10-22: #0909's close-out (check/validating phase) started at 03:03Z and did nothing visible for 48 minutes. At 03:51:39Z the attention event 'Ran locally' recorded: 'ssh upload of candidate bundle to thinkpad failed: [stdin error: EPIPE: broken pipe, write]'. Only then did the gate start locally on the laptop (which also burns the laptop's memory, the problem remote validation is meant to avoid). thinkpad was swap-bound at the time (3579/4095 MB, 87%). The upload to a pressured or wedged host had no hard deadline short enough to fail fast, #0901's health probe did not keep the upload from going to that host, and nothing in the UI/task showed what the close-out was waiting on (the user only saw 'check', and asked why it was stuck for over an hour).

## Desired UX
A stalled upload fails within about 60-90 s, the close-out retries on another healthy runner (retryOtherHosts) before falling back to local, and the task and close-out card show the phase detail ('uploading bundle to thinkpad, 40 s', 'host thinkpad skipped: swap 87%') plus what it is waiting on.

## Acceptance criteria
- Hard deadline on candidate bundle upload and the remote probe (ssh ServerAlive options and a wall-clock cap), with a test using a fake host that accepts the connection and then stalls.
- Real upload progress, not just size and elapsed: the card shows bytes sent / total, percent, current rate and ETA (read bytes written to the ssh/scp stream, not only a heartbeat), per host and per attempt, plus total time in the stage across all attempts. Today the card says 'uploading bundle 201 MB · 10s' from a 5 s heartbeat with no progress, and each of the 3 attempts restarts the clock.
- Abort when slower than normal: if the measured rate or ETA means the upload cannot finish within a budget (default 2-3 minutes, Settings control), cancel it and retry on another healthy host, or fall back, instead of waiting for the broken pipe; a hard 'abort close-out stage' button on the card and a CLI command (see #0919: repoos done --cancel / repoos abort <id>) that stops the current stage cleanly, including interrupting an in-flight ssh write, and records why.
- Speed-aware choice of local vs remote: estimate upload time (bundle bytes / measured uplink rate) plus the expected remote gate time against the expected local gate time (use recorded last_close_out_gate_ms); when the upload alone would take longer than a few minutes (hotspot, tethering, away from home), or round-trip time to the host is over about 1 s, skip the upload and run the gate locally when the laptop is healthy (pressure signal from #0918), and say so on the card ('slow uplink 2.5 Mbps: running locally'). Optional Settings toggle 'I am on a slow or metered link' to force local, with auto-detect from the same measurement.
- Link quality is measured before sending a big bundle: a short probe of round-trip time and a small test transfer per host; a host with throughput under a floor is skipped or deferred, and uploads to different hosts from the same laptop are serialized or rate-shared so they do not saturate the uplink (2026-10-22: three bundles at once from a hotspot gave 1.2 s RTT and ~300 KB/s).
- Incremental upload is expected to be kilobytes (#0717): when a bundle is large (for example 201 MB), record why (missing mirror base on that host, mirror cleared, full-history bundle) and refresh the host mirror once so later runs are small; show 'full bundle (mirror empty)' in the card.
- On upload failure or timeout, retry on the next healthy host before local fallback; local fallback only when every eligible host failed.
- #0901's pressure probe also gates the upload: a host at or above the swap limit is skipped before any bytes are sent; add a test for 87% swap.
- Close-out phase detail (current host, bytes sent, elapsed, reason a host was skipped) is recorded in the integration job and shown in the drawer/close-out card (see #0897 for queue visibility).
- Docs: docs/remote-validation.md and docs/debugging-check-failures.md.

## Notes for AI
Evidence: .repoos/integration-jobs/0909.json (phaseTimings) and the remoteFallback event in .repoos/attention-events.json. Related: #0897, #0901, #0910, #0916.

## Shots
```json
[
{
"label": "Close-out card shows bundle upload progress",
"target": "default",
"route": "/",
"highlight": ".tc-moving",
"state": "closeOut:uploading"
},
{
"label": "Remote validation drawer bundle upload settings",
"target": "default",
"route": "/settings?section=remote-validation",
"highlight": "[data-config-key=\"remoteValidation.bundleUploadBudgetSecs\"]",
"steps": [
{
"click": ".tunnel-setting-actions button"
},
{
"waitMs": 500
}
]
}
]
```

## Activity

- 2026-10-22T04:09:06Z · created · njachowski@gmail.com
- 2026-10-22T04:33:52Z · body: Acceptance criteria (added 4)
- 2026-10-22T04:51:35Z · body: Acceptance criteria (added 3, removed 2)
- 2026-10-22T07:49:12Z · status inbox→ready
- 2026-10-22T07:49:29Z · cli_override, model_override
- 2026-10-22T07:49:30Z · status ready→active, branch
- 2026-10-22T08:07:33Z · message_queued at 2026-10-22T08:07:33.822Z
- 2026-10-22T08:07:33Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-22T08:07:47Z · body
- 2026-10-22T08:10:21Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T08:10:26Z · body
- 2026-10-22T08:11:38Z · body
- 2026-10-22T08:15:22Z · body
- 2026-10-22T08:17:38Z · body
- 2026-10-22T08:18:13Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-22T08:18:13Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T08:18:13Z · message_delivered: 1 message(s)
- 2026-10-22T08:19:54Z · body
- 2026-10-22T08:29:16Z · handoff failed · remote validation failed: test failure: tests/config-docs.test.ts > repoos.toml and environment docs > documents every field in the config schema, tests/config-docs.test.ts > repoos.toml and environment docs > documents every key the parser supports, including parser-only sections on bee — fix it in the feature branch and re-run the gate
- 2026-10-22T08:34:23Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/config-docs.test.ts > repoos.toml and environment docs > documents every field in the config schema, tests/config-docs.test.ts > repoos.toml and environment docs > documents every key the parser supports, including parser-only sections on bee — fix it in the feature branch and re-run the gate
- 2026-10-22T08:36:46Z · body
- 2026-10-22T08:42:33Z · body
- 2026-10-22T08:43:05Z · body
- 2026-10-22T08:46:52Z · body
- 2026-10-22T08:49:24Z · body
- 2026-10-22T08:53:33Z · CTO nudge: held — handoff gate is running
- 2026-10-22T09:15:50Z · note: handoff requested (ui-review)
- 2026-10-22T09:30:25Z · note: ui verification failed: ui verification failed (4 issue(s)): [missing-target] Close-out card shows bundle upload progress (target "default"): state "closeOut:uploading" did not render on target "default" — / shows no task card (http://127.0.0.1:34597/?shotState=closeOut%3Auploading); [missing-target] Close-out card shows bundle upload progress (target "default"): highlight .tc-moving matched nothing on / (http://127.0.0.1:34597/?shotState=closeOut%3Auploading); [missing-target] Remote validation
- 2026-10-22T09:30:25Z · handoff failed · ui-review handoff failed at verify · ui verification failed (4 issue(s)): [missing-target] Close-out card shows bundle upload progress (target "default"): state "closeOut:uploading" did not render on target "default" — / shows no task card (http://127.0.0.1:34597/?shotState=closeOut%3Auploading); [missing-target] Close-out card shows bundle upload progress (target "default"): highlight .tc-moving matched nothing on / (http://127.0.0.1:34597/?shotState=closeOut%3Auploading); [missing-target] Remote validation drawer bundle upload settings (target "default"): click .tunnel-setting-actions button: click: Error: strict mode violation: locator('.tunnel-setting-actions button') resolved to 3 elements: on /settings?section=remote-validation (http://127.0.0.1:34597/settings?section=remote-validation); [missing-target] Remote validation drawer bundle upload settings (target "default"): highlight [data-config-key="remoteValidation.bundleUploadBudgetSecs"] matched nothing on /settings?section=remote-validation (http://127.0.0.1:34597/settings?section=remote-validation)
- 2026-10-22T09:51:13Z · assigned_to
- 2026-10-22T09:51:32Z · assigned_to
- 2026-10-22T11:36:25Z · note: ui verification failed: ui verification failed (4 issue(s)): [missing-target] Close-out card shows bundle upload progress (target "default"): state "closeOut:uploading" did not render on target "default" — / shows no task card (http://127.0.0.1:46587/?shotState=closeOut%3Auploading); [missing-target] Close-out card shows bundle upload progress (target "default"): highlight .tc-moving matched nothing on / (http://127.0.0.1:46587/?shotState=closeOut%3Auploading); [missing-target] Remote validation
- 2026-10-22T11:36:26Z · handoff failed · handoff recovery attempted · finalization failed
