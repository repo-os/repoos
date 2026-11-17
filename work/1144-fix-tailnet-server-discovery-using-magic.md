---
id: "1144"
title: Fix tailnet server discovery using MagicDNS peer identities
type: bug
status: review
human_step_override: Cleared needs-human-step flag (sticky until acceptance criteria change)
human_step_override_key: 2558bc2b
priority: p1
area: [server, core, mobile]
assigned_to: ai
created_by: t@t
branch: feat/fix-tailnet-server-discovery-using-magic
created_at: "2026-11-17T02:38:50Z"
updated_at: "2026-11-17T02:57:20Z"
---
## Problem
On the RepoOS server running on Air, repoos servers --tailscale reports Peck’s Mac mini and Nothing Phone (3a) as invalid hostnames and tries to resolve omarchy instead of the MagicDNS names bee and thinkpad. Tailscale status shows duplicate HostName omarchy entries with distinct DNSName values bee.tailc0c173.ts.net and thinkpad.tailc0c173.ts.net; the Mac mini has a display HostName with spaces and punctuation but DNSName mini.tailc0c173.ts.net. This prevents terminal discovery and may explain missing Hub discovery results.

## Acceptance criteria
- Use each peer’s stable, valid Tailscale MagicDNS identity for SSH and deduplication; preserve a readable display name separately where useful. Distinct peers with the same HostName must not collapse.
- Online bee, thinkpad and mini-shaped peers are individually probed; unsupported mobile peers do not produce misleading SSH failures. Preserve useful errors for genuine unreachable server-capable hosts.
- Preserve configured-host fallback, safe SSH argument validation, existing JSON compatibility, and HTTPS URL mapping for discovered servers.
- Add deterministic regression coverage for duplicate hostnames, punctuation and spaces in display names, MagicDNS names, and unsupported mobile peers.
- Verify the Hub discovery flow and signed-in RepoOS server requirement; make failures actionable and ensure reachable discovered servers can appear.
- Update affected user documentation.

## Notes for AI
Start with src/core/tailnet-servers.ts: peer identity currently prefers HostName over DNSName. User reported no discovered servers in Android Hub. Tailscale authentication on the phone and the RepoOS server session are distinct; investigate rather than assuming they are the same failure. Use fakes for tests and avoid modifying remote hosts.

## Activity

- 2026-11-17T02:38:50Z · created · t@t
- 2026-11-17T02:38:51Z · needs_input
- 2026-11-17T02:38:59Z · needs_input, body: Acceptance criteria (added 2, removed 2)
- 2026-11-17T02:39:11Z · status inbox→ready
- 2026-11-17T02:39:13Z · status ready→active, branch
- 2026-11-17T02:53:44Z · body
- 2026-11-17T02:57:20Z · status active→review
- 2026-11-17T02:57:20Z · message_queued at 2026-11-17T02:57:20.730Z
