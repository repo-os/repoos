---
id: "0957"
title: "Bug: remote validation link probe rejects usable high-latency links (throughput includes ssh setup time)"
type: bug
status: done
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/bug-remote-validation-link-probe-rejects
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-25T09:39:56Z"
updated_at: "2026-10-29T12:14:11Z"
last_handoff_failure_fingerprint: "check|repoos check failed: ◆ Check plan"
last_handoff_failure_sha: 78db36984edf375ea554aacdafedf74bcbf50a1d
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-10-25T10:46:43.085Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-10-25T11:13:08.170Z\",\"reason\":\"clean-exit-without-handoff\"}]"
dev_error_count: 4
engineer_crash_log: "[{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-10-25T12:28:37.623Z\",\"kind\":\"dev-error\"},{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-10-25T12:28:54.917Z\",\"kind\":\"dev-error\"},{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-10-25T12:29:18.832Z\",\"kind\":\"dev-error\"}]"
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

## Shots
```json
[
{
"label": "Remote link probe thresholds in Settings",
"target": "default",
"route": "/settings?tab=general&section=remote-validation",
"highlight": "#settings-section-remote-validation"
}
]
```

## Activity

- 2026-10-25T09:39:56Z · created · njachowski@gmail.com
- 2026-10-25T09:41:23Z · status inbox→ready
- 2026-10-25T09:44:48Z · status ready→active, branch
- 2026-10-25T09:48:42Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T10:10:16Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T10:16:28Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T10:21:42Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-10-25T10:29:34Z · message_queued at 2026-10-25T10:29:34.606Z
- 2026-10-25T10:29:35Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T10:34:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T10:41:16Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T10:41:17Z · message_delivered: 1 message(s)
- 2026-10-25T10:41:41Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T10:46:43Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 2/3 in 30m
- 2026-10-25T11:13:08Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 2/3 in 30m
- 2026-10-25T11:29:32Z · cli_override, model_override
- 2026-10-25T11:35:14Z · message_queued at 2026-10-25T11:35:14.897Z
- 2026-10-25T11:35:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T11:35:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T11:37:19Z · body
- 2026-10-25T11:37:37Z · agent exited with an error (codex) · the agent process exited with an error — open the task to see the full output
- 2026-10-25T11:37:37Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-10-25T11:37:43Z · message_delivered: 1 message(s)
- 2026-10-25T12:28:37Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · 2026-10-25T12:28:32.947741Z ERROR codex_core::session: failed to record rollout items: thread 01a172dc-6c08-73d1-bab4-8bd26252dd6c not found
- 2026-10-25T12:28:54Z · engineer crash recovery: resuming codex + gpt-6-luna (2/3 crashes in 30m) · Reading additional input from stdin...
- 2026-10-25T12:29:18Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-25T12:29:32Z · cli_override, model_override
- 2026-10-25T12:30:01Z · needs_input
- 2026-10-25T12:30:02Z · message_queued at 2026-10-25T12:30:02.080Z
- 2026-10-25T12:35:05Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-25T12:35:06Z · note: handoff requested (cli)
- 2026-10-25T12:39:49Z · handoff failed · task-file handoff failed at check · repoos check failed: ◆ Check plan
- 2026-10-25T13:30:04Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T13:43:45Z · note: handoff requested (ui-review)
- 2026-10-25T13:46:05Z · CTO nudge: held — handoff gate is running
- 2026-10-25T13:48:48Z · handoff failed · ui-review handoff failed at check · repoos check failed: ◆ Check plan
- 2026-10-25T13:51:05Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T13:56:55Z · status active→done
- 2026-10-25T13:56:57Z · engineer stopped by request
- 2026-10-25T14:02:08Z · message_overdue: still queued after 60m without being delivered
- 2026-10-25T15:32:54Z · message_overdue: still queued after 60m without being delivered
- 2026-10-25T16:16:27Z · message_overdue: still queued after 60m without being delivered
- 2026-10-25T16:50:45Z · message_overdue: still queued after 60m without being delivered
- 2026-10-25T18:03:15Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T05:32:31Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T06:59:38Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T07:53:29Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T09:03:36Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T11:14:37Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T14:01:00Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T14:10:54Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T14:44:17Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T14:53:31Z · message_overdue: still queued after 60m without being delivered
- 2026-10-26T18:50:06Z · message_overdue: still queued after 60m without being delivered
- 2026-10-27T12:03:45Z · message_overdue: still queued after 60m without being delivered
- 2026-10-27T14:11:04Z · message_overdue: still queued after 60m without being delivered
- 2026-10-28T03:37:40Z · message_overdue: still queued after 60m without being delivered
- 2026-10-28T09:18:41Z · message_overdue: still queued after 60m without being delivered
- 2026-10-28T09:48:54Z · message_overdue: still queued after 60m without being delivered
- 2026-10-28T11:31:29Z · message_overdue: still queued after 60m without being delivered
- 2026-10-28T16:40:24Z · message_overdue: still queued after 60m without being delivered
- 2026-10-29T04:29:40Z · message_overdue: still queued after 60m without being delivered
- 2026-10-29T12:14:11Z · message_overdue: still queued after 60m without being delivered
