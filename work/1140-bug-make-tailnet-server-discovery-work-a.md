---
last_close_out_gate_ms: 578627
last_close_out_gate_at: "2026-11-16T12:31:09.888Z"
id: "1140"
title: "Bug: make tailnet server discovery work across remote shells and hand-run servers"
type: bug
status: review
priority: p1
area: [server, core]
assigned_to: ai
created_by: t@t
branch: feat/bug-make-tailnet-server-discovery-work-a
created_at: "2026-11-16T03:38:56Z"
updated_at: "2026-11-16T12:31:09Z"
review_passes: 4
review_failed_report_retries: 0
review_rounds: 2
routing_switches: 1
routing_escalations: 1
dev_error_count: 1
---
## Problem

`repoos servers --tailscale --json` reports configured hosts as `unreachable` even though SSH works. On this Mac the Tailscale CLI is absent, so discovery uses the configured host pool. The SSH probe runs `repoos servers --json` as a non-login remote command; the host's interactive/login PATH setup is not loaded, so `repoos` can be missing. The current error classifier also matches the literal `ConnectTimeout=4` SSH option and reports unrelated SSH failures as `timed out`.

There is a second mismatch on ThinkPad: `repoos status` reports a running hand-run RepoOS server, while `repoos servers` reports no registered servers. Tailnet discovery relies on the registry, so it cannot report that instance. Investigate why a running `repoos serve` is not registered and make the registry/status contract consistent.

## Desired behavior

- Tailnet discovery works when the local Tailscale CLI is absent by using configured hosts, and clearly identifies that fallback in text and JSON output.
- Remote `repoos servers --json` executes with a predictable PATH on supported remote shells, without relying on an interactive terminal.
- SSH command-not-found, authentication, and connection errors retain their actual cause. Only a real timeout is labeled `timed out`; do not classify by matching arbitrary error text that includes `ConnectTimeout`.
- A running RepoOS control-plane server is discoverable consistently from `repoos status`, local `repoos servers`, and `repoos servers --tailscale`, including when started with the documented hand-run `repoos serve` flow. If a server is intentionally excluded from registration, make that distinction explicit in status and user docs.
- Continue reporting other hosts when one host fails, and preserve local-only behavior for `--prune`.

## Acceptance criteria

1. Tests cover absent Tailscale CLI with configured-host fallback and surfaced fallback status.
2. Tests cover remote executable lookup/PATH under non-interactive SSH and representative supported remote shells, with safe command construction.
3. A regression test proves an SSH error containing `ConnectTimeout=4` but caused by command-not-found is not reported as a timeout; actual timeout remains reported as `timed out`.
4. Tests cover the running-but-unregistered server case and verify the intended behavior across `status`, `servers`, and tailnet discovery.
5. Update `user-docs/cli.md` and any directly affected operational docs. No runtime dependencies.

## Notes for AI
Reproduce the reported behavior first with fake Tailscale and SSH executables; keep tests deterministic and do not depend on a live tailnet. Inspect the registered-server lifecycle before changing it, and preserve registry safety checks and loopback-only server binding. Use the repo's established subprocess helpers and safe argument handling; don't add runtime dependencies. Keep the fix focused on tailnet discovery, error classification, and the documented server-registration contract. Do not change another host's state while validating.

## Activity

- 2026-11-16T03:38:56Z · created · t@t
- 2026-11-16T03:38:56Z · needs_input
- 2026-11-16T03:39:08Z · needs_input, body: Notes for AI (added)
- 2026-11-16T03:51:25Z · status inbox→ready
- 2026-11-16T03:51:31Z · status ready→active, branch
- 2026-11-16T04:20:09Z · message_queued at 2026-11-16T04:20:09.528Z
- 2026-11-16T04:20:09Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-16T04:21:24Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-16T04:22:34Z · body
- 2026-11-16T04:23:12Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-16T04:23:12Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Now the scoped check. This can take a while. · stderr: (empty)
- 2026-11-16T04:23:14Z · message_delivered: 1 message(s)
- 2026-11-16T04:26:24Z · message_queued at 2026-11-16T04:26:24.427Z
- 2026-11-16T04:26:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-16T04:29:27Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-16T04:29:28Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Now the scoped check. This can take a while. · stderr: (empty)
- 2026-11-16T04:29:28Z · message_delivered: 1 message(s)
- 2026-11-16T04:31:24Z · message_queued at 2026-11-16T04:31:24.443Z
- 2026-11-16T04:31:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-16T04:33:34Z · body
- 2026-11-16T04:36:24Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-16T04:36:57Z · queued message undelivered for 6m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-16T04:36:58Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Now the scoped check. This can take a while. · stderr: (empty)
- 2026-11-16T04:36:58Z · message_delivered: 1 message(s)
- 2026-11-16T04:41:24Z · message_queued at 2026-11-16T04:41:24.472Z
- 2026-11-16T04:41:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-16T04:42:22Z · body
- 2026-11-16T04:44:28Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-16T04:44:28Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Now the scoped check. This can take a while. · stderr: (empty)
- 2026-11-16T04:44:28Z · message_delivered: 1 message(s)
- 2026-11-16T04:46:24Z · message_queued at 2026-11-16T04:46:24.456Z
- 2026-11-16T04:46:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-16T04:49:28Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-16T04:49:28Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Now the scoped check. This can take a while. · stderr: (empty)
- 2026-11-16T04:49:29Z · message_delivered: 1 message(s)
- 2026-11-16T04:49:49Z · body
- 2026-11-16T04:51:24Z · message_queued at 2026-11-16T04:51:24.481Z
- 2026-11-16T04:51:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-16T04:54:47Z · status active→review
- 2026-11-16T04:54:48Z · message_queued at 2026-11-16T04:54:48.293Z
- 2026-11-16T04:54:49Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-16T04:55:39Z · note: review pass 1: failed — no usable report
- 2026-11-16T04:56:02Z · note: review pass 2: failed — no usable report
- 2026-11-16T04:56:32Z · note: review pass 3: failed — no usable report
- 2026-11-16T04:56:32Z · needs_input
- 2026-11-16T05:13:41Z · needs_input (review-failed) cleared for review again by hello@repoos.org
- 2026-11-16T05:26:23Z · note: review pass 4: needs some work
- 2026-11-16T05:26:26Z · message_delivered: 1 message(s)
- 2026-11-16T05:26:26Z · status review→active
- 2026-11-16T05:48:21Z · body
- 2026-11-16T05:59:21Z · body
- 2026-11-16T07:02:01Z · watchdog: restarting engineer after 63m with no live process
- 2026-11-16T07:13:19Z · body
- 2026-11-16T07:24:00Z · body
- 2026-11-16T07:25:57Z · status active→review
- 2026-11-16T07:25:57Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-16T07:26:40Z · message_queued at 2026-11-16T07:26:40.536Z
- 2026-11-16T07:34:50Z · note: review pass 5: needs some work
- 2026-11-16T07:34:51Z · message_delivered: 1 message(s)
- 2026-11-16T07:34:51Z · status review→active
- 2026-11-16T07:51:45Z · message_queued at 2026-11-16T07:51:45.801Z
- 2026-11-16T07:51:45Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-16T07:54:47Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-16T07:54:47Z · message_delivered: 1 message(s)
- 2026-11-16T08:05:54Z · body
- 2026-11-16T08:12:11Z · status active→review
- 2026-11-16T08:12:12Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-16T08:13:34Z · message_queued at 2026-11-16T08:13:34.565Z
- 2026-11-16T08:13:37Z · handoff failed · could not auto-retry after check failure · This worktree already has a recorded live engineer for task #review:1140 (pid 61326)
- 2026-11-16T08:15:03Z · note: review pass 6: failed — no usable report
- 2026-11-16T08:16:43Z · note: review pass 7: failed — no usable report
- 2026-11-16T08:18:17Z · note: review pass 8: failed — no usable report
- 2026-11-16T08:18:17Z · needs_input
- 2026-11-16T08:27:33Z · needs_input (review-failed) cleared for review again by hello@repoos.org
- 2026-11-16T08:36:32Z · note: review pass 9: needs some work
- 2026-11-16T08:36:32Z · needs_input
- 2026-11-16T08:37:09Z · status review→active
- 2026-11-16T08:37:09Z · note: send-back — returned to active for engineer follow-up
- 2026-11-16T08:37:11Z · message_delivered: 1 message(s)
- 2026-11-16T08:37:11Z · needs_input
- 2026-11-16T08:37:12Z · message_queued at 2026-11-16T08:37:12.334Z
- 2026-11-16T08:38:55Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-16T08:39:10Z · note: stopped orphaned engineer pid 68505
- 2026-11-16T08:39:10Z · agent exited with an error (opencode) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: ✗ automatic check-failure retry could not resume: This worktree already has a recorded live engineer for task #review:1140 (pid 61326))
- 2026-11-16T08:39:10Z · status active→review
- 2026-11-16T08:39:10Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-16T08:39:12Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-16T08:40:18Z · needs_input
- 2026-11-16T08:40:19Z · message_delivered: 1 message(s)
- 2026-11-16T08:40:20Z · message_queued at 2026-11-16T08:40:20.048Z
- 2026-11-16T08:46:41Z · queued message undelivered for 6m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-16T08:46:41Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Now the required scoped check. · stderr: (empty)
- 2026-11-16T08:46:41Z · status active→review
- 2026-11-16T08:46:41Z · message_delivered: 1 message(s)
- 2026-11-16T08:46:41Z · note: handoff requested (cli)
- 2026-11-16T08:49:09Z · CTO nudge: held — handoff gate is running
- 2026-11-16T08:56:32Z · message_queued at 2026-11-16T08:56:32.374Z
- 2026-11-16T08:56:32Z · handoff failed · task-file handoff failed at commit · could not clear the staging index: fatal: Unable to create '/Users/nick/code/nick/repoos/.git/worktrees/bug-make-tailnet-server-discovery-work-a/index.lock': File exists. · Another git process seems to be running in this repository, or the lock file may be stale
- 2026-11-16T08:59:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-16T08:59:41Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-16T08:59:41Z · status active→review
- 2026-11-16T08:59:41Z · message_delivered: 1 message(s)
- 2026-11-16T08:59:41Z · note: handoff requested (cli)
- 2026-11-16T09:04:09Z · CTO nudge: held — handoff gate is running
- 2026-11-16T09:26:52Z · body
- 2026-11-16T09:28:42Z · message_queued at 2026-11-16T09:28:42.170Z
- 2026-11-16T09:28:42Z · handoff failed · task-file handoff failed at review · could not commit finalized engineering report: A check is running; wait for it to finish.
- 2026-11-16T09:29:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-16T09:32:11Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-16T09:32:11Z · status active→review
- 2026-11-16T09:32:11Z · message_delivered: 1 message(s)
- 2026-11-16T09:32:11Z · note: handoff requested (cli)
- 2026-11-16T09:34:09Z · CTO nudge: held — handoff gate is running
- 2026-11-16T09:45:23Z · message_queued at 2026-11-16T09:45:23.387Z
- 2026-11-16T09:45:23Z · handoff failed · task-file handoff failed at review · Engineering report narrative is 1221 words; the hard limit is 1,200 words of narrative. Shorten it and request handoff again.
- 2026-11-16T09:46:55Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-16T09:46:55Z · message_queued at 2026-11-16T09:46:55.168Z
- 2026-11-16T09:46:55Z · ↻ resuming engineer to read queued message
- 2026-11-16T09:46:55Z · status active→review
- 2026-11-16T09:46:55Z · message_delivered: 2 message(s)
- 2026-11-16T09:46:55Z · note: handoff requested (cli)
- 2026-11-16T09:56:08Z · status active→review
- 2026-11-16T09:56:09Z · message_queued at 2026-11-16T09:56:09.020Z
- 2026-11-16T09:56:09Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-16T10:10:00Z · note: review pass 10: good to go
- 2026-11-16T12:31:09Z · close-out gate completed in 579s

