---
id: "1140"
title: "Bug: make tailnet server discovery work across remote shells and hand-run servers"
type: bug
status: active
priority: p1
area: [server, core]
assigned_to: ai
created_by: t@t
branch: feat/bug-make-tailnet-server-discovery-work-a
created_at: "2026-11-16T03:38:56Z"
updated_at: "2026-11-16T04:41:24Z"
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
