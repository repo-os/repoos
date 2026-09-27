---
id: "0521"
title: "Remote validation: pool multiple tailscale hosts"
type: feature
status: ready
priority: p3
area: core
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-26T11:49:01Z"
updated_at: "2026-09-26T13:05:31Z"
---
## Problem

`[remoteValidation]` supports a single tailnet host (`tailscaleHost`), and
concurrent jobs queue on it (`docs/remote-validation.md`: "no autoscaling").
Once the pre-review gate also runs remotely, every task's gate plus every MTD
close-out competes for one machine. The owner has several tested tailscale
servers available that go unused.

## Changes

1. Allow a list of hosts (e.g. `tailscaleHosts`), keeping `tailscaleHost` as a
   single-host shorthand so existing configs keep working; add a migration or
   fallback and verify the parser still reads the current `repoos.toml`.
2. Dispatch each job to an idle host; queue only when all are busy. Track
   per-host in-flight state and health (unreachable hosts are skipped, then
   retried), and record which host ran each job in its log.
3. Per-host prerequisites check (Docker, `repoos-ci` image, bun-cache volume) so
   a misconfigured host is reported instead of failing jobs.
4. Settings UI control and status endpoint (`/api/remote-validation/status`)
   showing each host's state, per the AGENTS.md Settings-UI rule.

## Acceptance

- Test: two concurrent jobs run on two hosts; a third queues.
- Test: an unreachable host is skipped and jobs land on the others.
- Test: a single `tailscaleHost` config still works unchanged.
- `docs/remote-validation.md` updated.

## Dependency

Most valuable after "Run the pre-review gate on the remote validation runner".

## Activity

- 2026-09-26T11:49:01Z · created · unknown
- 2026-09-26T13:05:31Z · status inbox→ready
