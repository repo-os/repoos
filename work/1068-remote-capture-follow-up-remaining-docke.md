---
id: "1068"
title: "Remote capture follow-up: remaining Docker/ssh failure-handling and provider-parity gaps"
type: bug
status: inbox
priority: p2
area: server
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-09T03:05:29Z"
updated_at: "2026-11-09T03:05:29Z"
---
## Problem
#1060 landed the core fix for stalled remote browser captures (runner exits, finished captures are reaped and force-collected, a failed handoff cancels its own captures), verified for the Tailscale runner. The review loop (rounds 8-14+) kept finding narrower variants of the same theme, which the owner chose to track separately instead of blocking the release.

## Desired UX
Remote captures and validation never hang, leak containers or mask failures, on every runner provider, not just Tailscale.

## Acceptance criteria
- A failed watchdog/cancel container removal is reported as a failure (task event + log), is never reported as a successful removal, and does not start remote run cleanup, release the slot or settle the run as if the container were gone (`finalizeHungKill`, remote-validation.ts).
- `killContainerCommand` no longer ends in `|| true` in a way that hides removal failures; "No such container" counts as success, anything else is a failure.
- Every docker/ssh inspection call in the startup reaper (`validate.sh`) is guarded so one transient failure never aborts a validation run, and is logged.
- `RemoteValidationRunner` (the non-Tailscale provider, e.g. Hetzner) has cancellation parity with `TailscaleRunner.cancelBrowserCaptures`, or browserCapture requests are refused there with a clear message. Both provider hooks have tests.
- Tests reproduce each of the failure cases above (docker ps fails, docker logs fails, docker rm fails).

## Notes for AI
Start from the merged #1060 code on main and its review reports under work/reports/1060/ (review-8 to review-14) for the exact findings. Do not edit repoos.toml. Sweep the whole file for swallowed failures in one pass instead of fixing one line at a time.

## Activity

- 2026-11-09T03:05:29Z · created · njachowski@gmail.com
