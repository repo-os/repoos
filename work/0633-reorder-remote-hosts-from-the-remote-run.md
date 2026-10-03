---
updated_at: "2026-10-03T07:52:23Z"
review_passes: 1
id: "0633"
title: Reorder remote hosts and show per-host server stats on Remote runners
type: feature
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: ""
branch: feat/reorder-remote-hosts-and-show-per-host-s
cli_override: github copilot
model_override: default
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-10-03T06:03:47Z"
---
## Problem
The host pool order in remoteValidation.tailscaleHosts is the tie-break when hosts have equal load (all idle: top host wins), so the first host, mini, gets most runs. The order can only be changed by hand-editing repoos.toml, and getting it right is fragile:
- A live config change does not take effect: HostPool.sync() in src/server/remote-validation.ts keeps existing hosts in their old position and only appends new ones, so a reordered list is ignored until the server restarts.
- The single-host shorthand remoteValidation.tailscaleHost is inserted FIRST by parseTailscaleHosts (src/core/remote-hosts.ts) and a matching entry in tailscaleHosts is merged in place, so while the shorthand is set (e.g. mini) it stays at the top whatever order the list has.
- There is no way to see how loaded a host is, so there is no basis for choosing an order. A host can probe healthy but be busy with other work (mini, used by family) and run slowly.

## Desired UX
- On Checks → Remote runners, each host card can be moved up/down (buttons; drag is optional). Saving writes the new order to remoteValidation.tailscaleHosts through the normal config path, using the plain user@host list format (no rich-row migration).
- A note on the page: jobs go to the host with the fewest active runs; hosts with equal load are tried top to bottom, so when everything is idle the first host gets the work.
- Each host card gets a "Server stats" row: load average (1/5/15 min), CPU count (so load is readable as load per core), memory in use/total, and free disk for the work directory, plus the time the sample was taken. Sampled over the existing ssh channel (e.g. uptime, nproc, free/vm_stat, df), read-only, on a short interval or when the page is open, with a timeout so an unreachable host shows 'stats unavailable' without blocking the page. Sampling must not count as an in-flight run and must not queue behind runs.
- If the shorthand tailscaleHost is set and pins a host to the top, the page says so and what to remove.
- Reordering takes effect immediately for new runs, without a server restart. In-flight runs are unaffected.

## Acceptance criteria
- HostPool.sync() reorders this.hosts to match the configured order (keeping in-flight, health and last-run state; hosts being removed while active stay at the end). Unit test covers a reorder with an in-flight run.
- parseTailscaleHosts: when tailscaleHosts is a non-empty list, the shorthand no longer outranks the list's order (or the page flags the conflict); test covers shorthand + list in different orders.
- Reorder controls on the Remote runners page, keyboard accessible, using the shared styled components and no native title tooltips.
- The tie-break note is visible on the page.
- Server stats row per host in /api/remote-validation/status and on the page (aligned label/value layout per AGENTS.md kv-rows convention), tolerant of unreachable hosts, macOS and Linux output, and failed commands; parser unit tests with sample uptime/free/vm_stat/df output for both OSes.
- A reorder test through the config path; docs/remote-validation.md and user-docs/configuration.md describe the tie-break rule and the stats row.
- Hosts configured as rich [[remoteValidation.tailscaleHosts]] rows are shown read-only with a note, not rewritten.
- Any new user-facing setting (e.g. stats refresh interval, if added) is in getConfigSchema() and Settings.

## Notes for AI
Round-robin/random tie-breaking, a per-host enable toggle, and load-aware auto-ordering are deliberately out of scope (follow-ups; the stats row is the data they would need). Failover to another host on a transient failure is #0632.

## Shots
```json
[
  {
    "label": "Remote host order and server stats",
    "target": "default",
    "route": "/checks?tab=remote",
    "highlight": ".rr-host"
  }
]
```

## Activity

- 2026-10-03T06:03:47Z · created · unknown
- 2026-10-03T06:23:44Z · title, body
- 2026-10-03T06:45:00Z · cli_override, model_override
- 2026-10-03T06:45:07Z · review_cli_override
- 2026-10-03T06:45:09Z · review_model_override
- 2026-10-03T06:45:10Z · status inbox→ready
- 2026-10-03T06:45:34Z · status ready→active, branch
- 2026-10-03T07:37:21Z · note: CTO monitor nudge (standard completion nudge): your session on #0633 has been idle for ~51m with no worktree activity. If the work is complete, run the scoped pre-review check (`repoos check --changed main`) and request handoff (`repoos mv 0633 review`). If you're blocked, set needs_input or say so in the session.
- 2026-10-03T07:41:47Z · body: section Shots
- 2026-10-03T07:51:31Z · status active→review

