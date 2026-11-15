---
id: "1132"
title: Sync the budget allowlist across every RepoOS project and server on the tailnet
type: feature
status: inbox
priority: p1
area: [core, server, web]
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-15T15:20:04Z"
updated_at: "2026-11-15T15:20:04Z"
---
## Problem
The budget allowlist (`[[budget.allowlist]]`: CLIs, models, paused, pausedUntil, pausedModels, pausedReason) lives only in each repo's committed `repoos.toml`. Nick runs at least five projects on three machines: repoos on his MacBook, tiao and tuk-driver on bee, and neung and laisen on thinkpad. Whenever a quota resets or an account changes, he has to edit every file by hand on every machine.

On 15 Nov 2026 Codex came back. tuk-driver, neung, laisen and repoos still had codex fully paused (`paused = true`, `pausedUntil = "2026-11-15T12:00:00.000Z"`), while tiao had only gpt-6.1-terra paused. Each one had to be edited and committed separately. Nothing showed that the projects had drifted apart.

## Desired UX
- A user-level allowlist on each machine (for example `~/.config/repoos/allowlist.toml`) holds which CLIs and models the user can use and their pause state. Every project on that machine inherits it. A project's `repoos.toml` can add project-specific overrides only.
- A pause or resume made in one place (Settings > Budget Controls, or `repoos allowlist pause|resume <cli> [model] [--until <time>]`) applies on this machine. It can also be pushed to every RepoOS server reachable on the tailnet, using the same server-assisted discovery as #1127 (`GET /api/servers/tailnet`), behind a confirmation that lists the hosts and projects affected.
- Each project's Settings page shows where every entry comes from (user, project or synced from a host), and shows a drift warning when this project or machine differs from the others.

## Acceptance criteria
- Merging: the user-level allowlist is the base and `repoos.toml` entries override it per CLI or model. Existing project-only configs keep working unchanged. Table-driven tests cover the merge.
- A timed pause (`pausedUntil`) ends on its own at that time on every machine, with no file edits. An expired pause never keeps blocking starts.
- `repoos allowlist sync --tailnet` (and the matching UI button) applies a change to every reachable server. It reports each host and project as applied, unreachable or refused, and never pushes git or edits other repos' committed files without explicit opt-in.
- Settings > Budget Controls shows the source of each entry and any drift between projects.
- The new config keys get a `getConfigSchema()` entry, a Settings control, an entry in the supported-keys list, and docs in user-docs.

## Notes for AI
Look at `collectTailnetServers` in src/commands/servers.ts, src/core/tailnet-servers.ts, the `/api/servers/tailnet` route in src/server/routes/servers.ts, and how `budget.allowlist` is read today. Remote writes need auth on every server, so don't add an unauthenticated write endpoint.

## Activity

- 2026-11-15T15:20:04Z · created · t@t
