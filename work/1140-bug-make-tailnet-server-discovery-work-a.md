---
id: "1140"
title: "Bug: make tailnet server discovery work across remote shells and hand-run servers"
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Notes for AI"
priority: p1
area: [server, core]
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-16T03:38:56Z"
updated_at: "2026-11-16T03:38:56Z"
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

## Activity

- 2026-11-16T03:38:56Z · created · t@t
- 2026-11-16T03:38:56Z · needs_input
