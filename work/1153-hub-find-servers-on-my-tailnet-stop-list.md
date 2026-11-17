---
id: "1153"
title: "Hub 'Find servers on my tailnet': stop listing bare machines, hide phones, explain failures, and replace SSH discovery with an HTTPS-based one"
type: bug
status: active
priority: p2
area: [mobile, server, core]
assigned_to: ai
created_by: t@t
branch: feat/hub-find-servers-on-my-tailnet-stop-list
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-17T10:06:23Z"
updated_at: "2026-11-17T10:23:25Z"
---
## Problem

On Nick's phone (Hub, screenshots attached in chat) 'Find servers on my tailnet' lists Tailscale MACHINES (air, Peck's Mac mini, Nothing Phone (3a), muse) as 'Unreachable — timed out' rows next to the real RepoOS servers it found (tiao, tuk-driver on bee). Nick can SSH to thinkpad, bee and mini from his Mac (air), so this looks broken.

Cause (from code, src/core/tailnet-servers.ts + mobile/src/tailnet.ts): discovery runs on ONE server the phone asked (GET /api/servers/tailnet). That server lists online Tailscale peers and SSHes into each to run `repoos servers --json` (4s per host, 8s whole pass). SSH is pairwise: it needs THAT machine's key and the peer's Remote Login enabled. Working from air does not mean working from thinkpad or bee. A failed SSH falls back to a row named after the machine, so the screen shows machines, not projects. A phone ('Nothing Phone (3a)') slipped past isUnsupportedMobilePeer. air runs a saved 'repoos' server but its row is 'unreachable' rather than 'already saved'. 'timed out' may also just be the shared 8s deadline, not a real SSH timeout. `repoos servers --tailscale` from air works because air has the keys (it lists local, bee x2, thinkpad x2; muse fails with 'ssh: connect to host muse port 22: Connection refused'), so the CLI has the same limit: it only sees machines the CURRENT machine can SSH into.

## Desired UX

- The Hub screen shows RepoOS projects first. Machines that could not be checked go in a separate collapsed 'Couldn't check these machines' group, each with the real reason and one plain fix ('SSH is off on muse', 'no SSH key from thinkpad', 'timed out').
- Phones, tablets and other non-server devices are never listed.
- A machine that already hosts a saved server shows as saved, never as unreachable.
- Discovery does not depend on SSH keys between machines. Preferred design: each RepoOS server exposes a small tailnet-only discovery endpoint (name, port, tailscale HTTPS URL, project) and the asking server probes online peers over HTTPS/HTTP with a short parallel timeout on a well-known discovery port (or a machine-level listener that lists every RepoOS server on that machine, so one port per machine is enough). SSH stays as an optional fallback for older servers.

## Acceptance criteria

- [ ] On a tailnet like Nick's (air, bee, thinkpad, mini, muse, a phone), the Hub screen lists every running RepoOS project with its HTTPS URL, with no bare machine rows among the results.
- [ ] Machines that could not be checked appear only in a collapsed group with a specific reason; phones are excluded (fix isUnsupportedMobilePeer for 'Nothing Phone' style names using the peer OS/tags from tailscale status).
- [ ] A machine hosting a saved server is shown as saved.
- [ ] Discovery works with no SSH keys between machines, proven by a test that fakes the HTTP discovery responses, and the shared 8s deadline no longer turns healthy-but-slow hosts into 'timed out'.
- [ ] `repoos servers --tailscale` uses the same discovery (src/core stays the single implementation) and prints the same reasons.
- [ ] Older servers without the discovery endpoint still work through the SSH fallback, and say so plainly when they can't be listed.
- [ ] User docs and mobile/README.md are updated.

## Notes for AI

Do not add runtime dependencies. The discovery endpoint exposes names/ports only (no tokens or paths beyond the project root name) and must be reachable only over the tailnet. Reuse parseTailnetInfo and the existing result shape so mobile/src/tailnet.ts changes stay small.

## Activity

- 2026-11-17T10:06:23Z · created · t@t
- 2026-11-17T10:23:21Z · cli_override, model_override
- 2026-11-17T10:23:24Z · status inbox→ready
- 2026-11-17T10:23:25Z · status ready→active, branch
