---
id: "0633"
title: Reorder remote hosts from the Remote runners page
type: feature
status: inbox
priority: p2
area: [web, server]
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-10-03T06:03:47Z"
updated_at: "2026-10-03T06:03:47Z"
---
## Problem
The host pool order in remoteValidation.tailscaleHosts is the tie-break when hosts have equal load (all idle: top host wins), so the first host, mini, gets most runs. The order can only be changed by hand-editing repoos.toml, and a live config change does not even take effect: HostPool.sync() in src/server/remote-validation.ts keeps existing hosts in their old position and only appends new ones, so a reordered list is ignored until the server restarts.

## Desired UX
- On Checks → Remote runners, each host card can be moved up/down (buttons; drag is optional). Saving writes the new order to remoteValidation.tailscaleHosts through the normal config path, using the plain user@host list format (no rich-row migration).
- A short note on the page: jobs go to the host with the fewest active runs; hosts with equal load are tried top to bottom, so when everything is idle the first host gets the work.
- Reordering takes effect immediately for new runs, without a server restart. In-flight runs are unaffected.

## Acceptance criteria
- HostPool.sync() reorders this.hosts to match the configured order (keeping in-flight, health and last-run state; hosts being removed while active stay at the end). Unit test covers a reorder with an in-flight run.
- Reorder controls on the Remote runners page, keyboard accessible, using the shared styled components and no native title tooltips.
- The tie-break note is visible on the page.
- A reorder test through the config path; docs/remote-validation.md and user-docs/configuration.md describe the tie-break rule.
- Hosts configured as rich [[remoteValidation.tailscaleHosts]] rows are shown read-only with a note, not rewritten.

## Notes for AI
Round-robin/random tie-breaking and a per-host enable toggle are deliberately out of scope (follow-ups). Failover to another host on a transient failure is #0632.

## Activity

- 2026-10-03T06:03:47Z · created · unknown
