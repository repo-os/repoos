---
id: "1132"
title: "Allowlist groups: projects that opt into the same group share one budget allowlist across machines"
type: feature
status: active
priority: p1
area: [core, server, web]
assigned_to: ai
created_by: t@t
branch: feat/allowlist-groups-projects-that-opt-into-
created_at: "2026-11-15T15:20:04Z"
updated_at: "2026-11-15T18:33:40Z"
review_rounds: 1
routing_switches: 1
review_passes: 1
---
## Problem
The budget allowlist (`[[budget.allowlist]]`: CLIs, models, paused, pausedUntil, pausedModels, pausedReason) lives only in each repo's committed `repoos.toml`. Nick works for several companies. Each company has its own coding agents, model providers, accounts and quotas, and its projects are spread across his MacBook, bee and thinkpad. Projects that belong together, because they share the same company and the same logins, have to be hand-edited one by one. Nothing ties them together, and nothing notices when they drift apart.

On 15 Nov 2026 Codex came back. tuk-driver, neung, laisen and repoos still had codex fully paused (`paused = true`, `pausedUntil = "2026-11-15T12:00:00.000Z"`), while tiao had only gpt-6.1-terra paused. Each one had to be edited and committed separately.

The tailnet as a whole must **not** share one allowlist. Projects for different companies must not leak CLIs, models or pause state into each other.

## Desired UX
- **Allowlist groups:** a named group (for example `personal` or `acme`) holds an allowlist covering CLIs, models and pause state. A project joins a group explicitly in its `repoos.toml` (for example `[budget] allowlistGroup = "personal"`). A project with no group keeps today's project-only behavior.
- A project's own `[[budget.allowlist]]` entries layer on top of its group as overrides. Settings > Budget Controls shows the group name and where each entry comes from (group or project).
- A pause or resume in any member project updates the group. Every member project picks it up: on the same machine, and on other machines over the tailnet. Only members of that group change.
- Group members on other machines are found through server-assisted tailnet discovery (#1127, `GET /api/servers/tailnet`), and only those that declare the same group name are included. Before a change goes out, a confirmation lists the projects and hosts that will be updated. Each one then reports applied, unreachable or refused.
- Settings shows a drift warning when a member's effective allowlist differs from its group, with a one-click "Re-sync from group".
- Logins and credentials are never synced. A group says which CLIs and models are allowed and paused, and each machine still uses its own local login. A member whose machine isn't logged in to an allowed CLI shows that it's not logged in on that host, rather than failing silently.

## Acceptance criteria
- A project config can set `allowlistGroup`. Merging works as group base plus project overrides, with table-driven tests. Projects without a group behave exactly as they do today.
- A group's state is stored outside any single repo's committed `repoos.toml` (for example `~/.config/repoos/allowlist-groups/<name>.toml` on each machine, with a version or updatedAt so the newest change wins). It isn't committed into project repos, and it never holds secrets.
- A pause or resume through the UI or `repoos allowlist pause|resume <cli> [model] [--until <time>]` reaches every reachable member of that group, on any tailnet host, and no other project. A test proves a project in group B is untouched by a change in group A.
- Timed pauses (`pausedUntil`) end on their own on every member, and an expired pause never blocks starts.
- Remote updates need auth on the receiving server. There's no unauthenticated write endpoint. Nothing pushes git or edits another repo's committed files.
- Budget Controls shows the group name, where each entry comes from, any drift, and Re-sync. New config keys get a `getConfigSchema()` entry, a Settings control, an entry in the supported-keys list, and user-docs.

## Notes for AI
Start from how `budget.allowlist` is read and merged today, `collectTailnetServers` in src/commands/servers.ts, src/core/tailnet-servers.ts, and the `/api/servers/tailnet` route in src/server/routes/servers.ts. Keep the design for one machine with several groups working with no network access. Tailnet propagation is a layer on top. Don't make the tailnet a single group by default.

## Shots
```json
[
{
"label": "Budget Controls: join an allowlist group",
"target": "default",
"route": "/agents?tab=budget-controls",
"highlight": "[data-testid=\"budget-join-group\"]"
}
]
```

## Activity

- 2026-11-15T15:20:04Z · created · t@t
- 2026-11-15T15:25:40Z · title, body: Problem (added 3, removed 2); Desired UX (added 6, removed 3); Acceptance criteria (added 6, removed 5); Notes for AI (added 1, removed 1)
- 2026-11-15T16:09:55Z · status inbox→ready
- 2026-11-15T16:58:12Z · status ready→active, branch
- 2026-11-15T17:45:46Z · body
- 2026-11-15T17:53:38Z · body
- 2026-11-15T17:54:06Z · CTO nudge: held — handoff gate is running
- 2026-11-15T18:03:16Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-15T18:03:16Z · status active→review
- 2026-11-15T18:03:17Z · message_queued at 2026-11-15T18:03:17.089Z
- 2026-11-15T18:05:03Z · note: review pass 1: needs some work
- 2026-11-15T18:05:04Z · status review→active
- 2026-11-15T18:05:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T18:06:25Z · message_delivered: 1 message(s)
- 2026-11-15T18:29:07Z · message_queued at 2026-11-15T18:29:07.007Z
- 2026-11-15T18:29:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:30:31Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T18:33:40Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:33:40Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Round-2 fixes are committed in the self-check checkpoint (`3e00712`) and the scoped check is running. Waiting for it to complete. · stderr: (empty)
