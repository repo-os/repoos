---
id: "1105"
title: "repoos servers --tailscale: list RepoOS servers across the tailnet"
type: feature
status: inbox
priority: p2
area: [server, core]
assigned_to: ai
created_by: t@t
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T03:22:32Z"
updated_at: "2026-11-14T03:28:40Z"
---
## Problem
`repoos servers` lists only the servers registered on the local machine (~/.repoos/servers). To see what is running on bee, thinkpad or mini, the human must ssh in and run it there.

## Desired UX
`repoos servers --tailscale` lists the local servers plus those on every reachable peer on the tailnet, in one table with a host column. It composes with `--json`. Unreachable hosts show as "unreachable" with the reason and never fail the command. Each host has a short timeout. `--prune` stays local-only and never touches another machine. If Tailscale is not available, the command says so plainly and prints the local list.

## Acceptance criteria
1. `repoos servers --tailscale` shows local plus remote servers with a host column; `--json` includes the host.
2. Peers come from Tailscale status when the CLI is available, falling back to the hosts configured in `repoos.toml` (thinkpad, bee, mini); each remote runs `repoos servers --json` over ssh.
3. A slow or offline host times out and is shown as unreachable; the rest still print.
4. `--prune` with `--tailscale` refuses or ignores remote hosts; a test proves no remote deletion.
5. Documented in `user-docs/cli.md`; CLI/API parity list updated if a route is added; tests with fake ssh and a fake tailscale status.

## Notes for AI
Reuse `src/core/tailscale.ts` and `src/core/remote-hosts.ts`. Do not add a runtime dependency. Probe over ssh, not direct HTTP, because servers listen on 127.0.0.1 by default. Similar in size to #1092.

## Activity

- 2026-11-14T03:22:32Z · created · t@t
- 2026-11-14T03:28:40Z · cli_override, model_override
