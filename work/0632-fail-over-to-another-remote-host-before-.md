---
id: "0632"
title: Fail over to another remote host before falling back to local
type: feature
status: active
priority: p2
area: [server, web]
assigned_to: ai
created_by: ""
branch: feat/fail-over-to-another-remote-host-before-
model_override: openrouter/openrouter/free
review_cli_override: opencode
review_model_override: openrouter/openrouter/auto
created_at: "2026-10-03T06:01:04Z"
updated_at: "2026-10-03T09:28:03Z"
---
## Problem
A remote validation run is bound to one host when it starts (pool.acquire in src/server/remote-validation.ts). If that host then fails transiently mid-run (ssh drop, 'remote validation timed out'), nothing retries on the other pool hosts. The caller either falls back to the full local gate on the Air (remoteValidation.fallbackToLocal) or leaves the task retryable. Local fallback has taken 18+ minutes and hit 600s step timeouts, versus about 4 minutes on any remote host. A loaded host (e.g. mini) is probed healthy but runs slow, then times out.

## Desired UX
- New boolean setting remoteValidation.retryOtherHosts (default true when 2+ hosts are configured), with a Settings → Remote validation control and copy.
- On a transient failure on host A, retry the run on the next healthy, free host that was not already tried this run. Only after every eligible host has failed does the existing fallbackToLocal / retryable behaviour apply.
- Real build/test failures and config/routing errors never fail over (they are not infra problems).
- The run log and check-run history show each attempt and which host ran it.

## Acceptance criteria
- Transient failure on one host triggers a run on another host; test covers success on the second host.
- All hosts failing falls through to fallbackToLocal exactly as today.
- Non-transient and configError results do not retry.
- A host is not retried twice within one run; deadlineAt is respected across attempts.
- Setting is in getConfigSchema() and the Settings UI, with a test.
- docs/remote-validation.md and user-docs/configuration.md updated.

## Notes for AI
See src/server/remote-validation.ts (acquire ~1751, run + timeout handling ~1255, pool.acquire call ~2415), src/server/pre-review-remote-gate.ts (fallbackToLocal handling ~179). Host tie-break is config order when active counts are equal; a separate task covers reordering hosts in the UI.

## Activity

- 2026-10-03T06:01:04Z · created · unknown
- 2026-10-03T08:42:55Z · status inbox→ready
- 2026-10-03T09:27:54Z · model_override
- 2026-10-03T09:27:58Z · review_cli_override
- 2026-10-03T09:27:59Z · review_cli_override
- 2026-10-03T09:28:02Z · review_model_override
- 2026-10-03T09:28:03Z · status ready→active, branch
