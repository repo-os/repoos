---
id: "0323"
title: Machine-level tunnel app registry (stop repos clobbering each other's cloudflared ingress)
type: feature
status: ready
priority: p2
area: cli
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-03T17:21:26Z"
updated_at: "2026-09-03T17:51:59Z"
---
## Problem

`cloudflared` on a machine runs as ONE system service reading ONE config file
(`~/.cloudflared/config.yml`). RepoOS regenerates that entire file from a
SINGLE repo's `[tunnel.apps.*]` on every `repoos tunnel create` / `install`
(`renderCloudflaredConfig` in `src/core/tunnel.ts` iterates only
`Object.values(cfg.apps)` for the current repo; `writeUserCloudflaredConfig`
in `src/commands/tunnel.ts` overwrites the file wholesale — no merge).

So when two RepoOS repos on the same box each publish an app:

1. `repoos tunnel install` in repo A -> config has A's hostnames only
2. later, `repoos tunnel install` in repo B -> config replaced, B's hostnames
   only; **A's hostnames silently drop to the `http_status:404` catch-all**

`repoos tunnel status` / `list` also only ever show the current repo's apps,
so the machine's real published set is never visible from any one repo. This
bit us in practice (celleris + dev on one tunnel: dev.repoos.org started
404ing after a celleris-repo `tunnel install` overwrote the ingress).

Today's only workarounds are manual: one repo owns `[tunnel]` and hand-lists
every app the box serves, or a dedicated standalone "tunnel owner" repo does.
Both are fragile and non-obvious.

## Proposed solution

Introduce a machine-scoped tunnel registry that `repoos tunnel install`
composes from, instead of overwriting from one repo:

- A machine-level file, e.g. `~/.config/repoos/tunnel-apps.toml` (or a
  directory of per-repo fragments under `~/.config/repoos/tunnel-apps.d/`).
  Keyed by app name -> `{ hostname, service, access, noAccess, ownerRoot }`.
  `ownerRoot` records which repo checkout contributed the entry.
- `repoos tunnel create <name>` writes the app into BOTH the repo's
  `repoos.toml` (unchanged, still the per-repo source of truth) AND the
  machine registry.
- `repoos tunnel destroy <name>` removes it from both.
- `repoos tunnel install` / `start` render `~/.cloudflared/config.yml` from
  the UNION of all registry entries, not just the current repo — so bringing
  up the service from any repo on the box serves every published app.
- `repoos tunnel status` / `list` gain a machine view: show every app in the
  registry, annotate which repo owns each, and flag entries whose `ownerRoot`
  no longer exists on disk (stale) or whose `service` port has no listener.
- Tunnel identity (`tunnelId` / `name`) stays one-per-machine; if two repos'
  `[tunnel]` blocks disagree on `tunnelId`, `install` refuses and says so
  rather than silently picking one.
- One-time migration: on first `tunnel install` after upgrade, seed the
  registry from the current repo's `repoos.toml` `[tunnel.apps.*]` so
  existing single-repo setups are unaffected.

## Acceptance criteria

- [ ] Two repos on one machine can each `repoos tunnel create` an app, and a
      single `repoos tunnel install` (run from either) produces a
      `~/.cloudflared/config.yml` containing BOTH hostnames + the 404 catch-all.
- [ ] `repoos tunnel install` in repo B no longer removes repo A's ingress
      routes.
- [ ] `repoos tunnel status` shows all apps on the machine, each annotated
      with its owning repo, and marks stale entries (owner checkout gone) and
      dead origins (no listener on the service port).
- [ ] `repoos tunnel destroy <name>` removes the app from the repo toml, the
      machine registry, and the regenerated ingress.
- [ ] Conflicting `tunnelId` across repos makes `install` fail loudly, not
      silently pick one.
- [ ] Existing single-repo setups: first `install` after upgrade seeds the
      registry from `repoos.toml` and behaviour is unchanged (no lost routes,
      no duplicate entries).
- [ ] Registry read/write is covered by unit tests (union rendering, stale
      detection, migration seeding, conflict detection).
- [ ] Zero new runtime dependencies.
- [ ] `docs/` updated: document the machine registry, the "one tunnel per
      machine, many repos" model, and that `repoos tunnel` commands are
      machine-global not repo-local. Refresh the Cloudflare publishing
      assistant copy if it still implies per-repo tunnel ownership.

## Notes / pointers

- `src/core/tunnel.ts` — `renderCloudflaredConfig`, `parseTunnelSection`,
  `readTunnelConfig` / `writeTunnelConfig`, `emptyTunnelConfig`.
- `src/commands/tunnel.ts` — `writeDerivedConfig`, `writeUserCloudflaredConfig`,
  `cmdTunnelCreate` / `cmdTunnelDestroy` / `cmdTunnelInstall` / `cmdTunnelStart`
  / `cmdTunnelStatus` / `cmdTunnelList`, and the new `cmdTunnelRename`.
- `src/server/server.ts` `tunnelReadiness` (feeds the publishing-assistant
  drawer) should report the machine view too, not just the current repo.
- Prior context: commit 7600ee90 (clipboard fallback, derived serve port in
  the assistant, `repoos tunnel rename`, `repoos-<hostname>` default name).
- Keep the per-repo `repoos.toml` `[tunnel.apps.*]` as-is for readability and
  git history; the registry is a derived machine-level cache, not a
  replacement.

## Activity

- 2026-09-03T17:21:26Z · created · unknown
- 2026-09-03T17:51:59Z · status inbox→ready
