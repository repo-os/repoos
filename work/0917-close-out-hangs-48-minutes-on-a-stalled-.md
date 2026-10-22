---
id: "0917"
title: Close-out hangs ~48 minutes on a stalled ssh bundle upload before falling back to local; thinkpad swap full again
type: feature
status: inbox
priority: p1
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-22T04:09:06Z"
updated_at: "2026-10-22T04:09:14Z"
---
## Problem
2026-10-22: #0909's close-out (check/validating phase) started at 03:03Z and did nothing visible for 48 minutes. At 03:51:39Z the attention event 'Ran locally' recorded: 'ssh upload of candidate bundle to thinkpad failed: [stdin error: EPIPE: broken pipe, write]'. Only then did the gate start locally on the laptop (which also burns the laptop's memory, the problem remote validation is meant to avoid). thinkpad was swap-bound at the time (3579/4095 MB, 87%). The upload to a pressured or wedged host had no hard deadline short enough to fail fast, #0901's health probe did not keep the upload from going to that host, and nothing in the UI/task showed what the close-out was waiting on (the user only saw 'check', and asked why it was stuck for over an hour).

## Desired UX
A stalled upload fails within about 60-90 s, the close-out retries on another healthy runner (retryOtherHosts) before falling back to local, and the task and close-out card show the phase detail ('uploading bundle to thinkpad, 40 s', 'host thinkpad skipped: swap 87%') plus what it is waiting on.

## Acceptance criteria
- Hard deadline on candidate bundle upload and the remote probe (ssh ServerAlive options and a wall-clock cap), with a test using a fake host that accepts the connection and then stalls.
- On upload failure or timeout, retry on the next healthy host before local fallback; local fallback only when every eligible host failed.
- #0901's pressure probe also gates the upload: a host at or above the swap limit is skipped before any bytes are sent; add a test for 87% swap.
- Close-out phase detail (current host, bytes sent, elapsed, reason a host was skipped) is recorded in the integration job and shown in the drawer/close-out card (see #0897 for queue visibility).
- Docs: docs/remote-validation.md and docs/debugging-check-failures.md.

## Notes for AI
Evidence: .repoos/integration-jobs/0909.json (phaseTimings) and the remoteFallback event in .repoos/attention-events.json. Related: #0897, #0901, #0910, #0916.

## Activity

- 2026-10-22T04:09:06Z · created · njachowski@gmail.com
