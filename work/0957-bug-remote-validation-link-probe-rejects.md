---
id: "0957"
title: "Bug: remote validation link probe rejects usable high-latency links (throughput includes ssh setup time)"
type: bug
status: active
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/bug-remote-validation-link-probe-rejects
created_at: "2026-10-25T09:39:56Z"
updated_at: "2026-10-25T09:44:48Z"
---
## Problem

Remote validation skips every host with "link probe failed" whenever the laptop is on a higher-latency path to the runners (Nick is abroad: bee and thinkpad are reached through a Tailscale relay at about 105 to 190 ms round trip). Every handoff then fails as an infra failure ("remote validation unavailable: host X skipped: link probe failed"), falls back to a local run that times out at 420 seconds on a loaded machine, and the task cannot reach review. This blocked #0951 for hours today and also happened to #0950, even though `ssh <host> true` works fine from a shell.

Root cause (read from `src/server/bundle-upload.ts`, `probeHostLink` and `linkProbeAcceptable`): the "throughput" is computed as `64 KiB / total wall time of a brand-new ssh session` (`cat > /dev/null` with the payload on stdin), so it includes the whole ssh connection setup (several round trips plus key exchange, often 0.7 to 1.5 s on a relay path). 65536 bytes over about 1 s is about 64 KB/s, below `LINK_THROUGHPUT_FLOOR_BPS` (200 KB/s), so a perfectly usable link is rejected. The probe measures latency, not bandwidth.

## Desired UX

The probe judges bandwidth separately from connection setup, so a high-latency but fast-enough link is accepted. A really slow or broken link is still skipped. The failure message names the real reason (RTT, measured bandwidth, floor), and the thresholds are visible in Settings.

## Acceptance criteria

- [ ] Throughput is measured on the transfer itself: use a payload large enough to be meaningful (for example 1 MiB), and subtract the connection-setup time (measure it with the first `ssh true` or an ssh ControlMaster/ControlPersist session shared by the RTT and transfer steps). Add a test where setup takes 1 s and the transfer is fast: it must be accepted; and a test where the transfer is genuinely slow: it must be rejected.
- [ ] A high RTT alone (below the existing HIGH_RTT_MS) never fails the probe.
- [ ] The probe retries once with backoff before giving up (the three hosts failing at the same instant suggests transient link loss), and the skipped-host message includes rtt, measured KB/s and the floor.
- [ ] `LINK_THROUGHPUT_FLOOR_BPS` and the probe size are configurable under `remoteValidation` in `repoos.toml` with Settings UI controls and a test (AGENTS.md rule for user-facing settings).
- [ ] Docs updated (`docs/` remote validation notes and `user-docs/`), including a line about running from a high-latency network.
- [ ] Run every test touching bundle-upload and remote-validation in small groups, then `repoos check --changed main`.

## Notes for AI

- Do not start a second RepoOS server from a worktree (see #0954). Use fake `run` injection as the existing probe tests do.
- This is p1: it blocks every handoff whenever the laptop is on a relay or slow network.

## Activity

- 2026-10-25T09:39:56Z · created · njachowski@gmail.com
- 2026-10-25T09:41:23Z · status inbox→ready
- 2026-10-25T09:44:48Z · status ready→active, branch
