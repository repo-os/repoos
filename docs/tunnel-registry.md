# Machine-level tunnel registry

`cloudflared` on a machine runs as **one system service** reading **one
config file** (`~/.cloudflared/config.yml`). It has no notion of "repo" — so
when multiple RepoOS repo checkouts on the same box each publish an app
through Cloudflare Tunnel, they are all, in reality, sharing one tunnel.

Before this registry existed, `repoos tunnel install` regenerated that whole
config file from a **single repo's** `repoos.toml [tunnel.apps.*]` and
overwrote it wholesale. Two repos on one box would clobber each other:

1. `repoos tunnel install` in repo A → ingress has A's hostnames only.
2. Later, `repoos tunnel install` in repo B → ingress **replaced**, B's
   hostnames only. A's hostnames silently fall through to the
   `http_status:404` catch-all — A looks broken with no code change in A.

## The model: one tunnel per machine, many repos

- **`repoos.toml [tunnel.apps.*]`** in each repo is still that repo's own,
  git-tracked source of truth for the apps *it* publishes — unchanged by this
  feature, still readable/diffable/PR-reviewable per repo.
- **The machine registry**, `~/.config/repoos/tunnel-apps.toml`, is a derived,
  machine-local cache: the union of every repo's apps on this box, keyed by
  app name, each entry tagged with the repo checkout (`ownerRoot`) that
  contributed it. It is not git-tracked and not meant to be hand-edited.
- `repoos tunnel create`/`destroy` write to **both** — the repo's own
  `repoos.toml` and the machine registry — so the repo-local file never loses
  its role as the readable record of what that repo publishes.
- **Every mutating command re-syncs this repo's own apps into the registry
  first**, not just on first seed: if repoos.toml's `[tunnel.apps.*]` was
  hand-edited (a port or hostname changed) since the last sync, the next
  `create`/`destroy`/`install`/`start`/`rename`/`allow`/`deny` in that repo
  overwrites the registry's copy of *that repo's own* entries to match — a
  registry entry can never go stale relative to the repoos.toml that's
  supposed to own it. An app removed from repoos.toml by hand (rather than
  via `destroy`) is dropped from the registry the same way. Entries owned by
  *other* repos are never touched by this.
- `repoos tunnel install`/`start` render `~/.cloudflared/config.yml` /
  `~/.config/repoos/cloudflared.yml` from the **registry's union of every
  app**, not from any single repo's `repoos.toml`. Running `install` from
  *any* repo on the machine brings up ingress for *every* app any repo has
  published.
- `repoos tunnel list`/`status` are machine views: they show every app in the
  registry, not just the current repo's, annotated with which repo owns each
  (`ownerRoot`) and whether that owner checkout still exists on disk
  (`stale`) or has a listener on its local service port (dead origin).
- **Tunnel identity is one-per-machine.** `tunnelId`/`name` live in the
  registry once any repo has run `repoos tunnel setup`. If a repo's own
  `[tunnel]` block names a *different* `tunnelId` than the registry's, every
  mutating command (`create`, `destroy`, `install`, `start`, `rename`,
  `allow`, `deny`) refuses and reports the conflict — it never silently picks
  one side. `repoos tunnel setup` reuses an existing tunnel **by name**, so it
  only joins the registry's tunnel if the names happen to match; the reliable
  fix is to hand-edit the conflicting repo's repoos.toml `[tunnel]` block so
  `tunnel_id` (and `name`) match the registry's, or to resolve it the other
  way by hand-editing the registry file.
- **App names are shared machine-wide.** `repoos tunnel create <name>` fails
  if another repo already owns an app with that name — pick a different one.
  If the name also already exists in *this* repo's own repoos.toml (a
  collision left over from before the registry existed), the error says so
  explicitly rather than the generic "already exists" message that would
  otherwise imply this repo's local copy is the one that matters machine-wide.
- **Concurrent `repoos tunnel` processes on the same machine can't lose an
  entry.** Every mutating command's read-modify-write cycle holds an
  exclusive lock (`~/.config/repoos/tunnel-apps.toml.lock`) for its duration,
  so two repos running `create`/`install`/etc. at the same moment serialize
  instead of one clobbering the other's just-written change.

## Migration for existing setups

The registry starts empty. The first time any repo on the machine runs
`create`, `destroy`, `install`, `start`, or `rename` after upgrading to a
RepoOS version with this feature, that repo's own apps (from its
`repoos.toml`) are seeded into the registry under its own `ownerRoot` — any
app name the registry doesn't already have an entry for. This is per-app, not
an all-or-nothing "registry is empty" gate: on a machine with several
pre-existing repos that each already published their own apps (the exact
"celleris + dev" scenario this registry exists to fix), each repo seeds its
own apps into the registry the first time *that repo* runs one of those
commands — regardless of whether another repo got there first. A single-repo
setup sees no behavior change: its apps are all it ever adds, in one shot.

## `repoos tunnel status`/`list` output

Each app is annotated with:

- **owner** — the `ownerRoot` repo checkout path.
- **stale** — the owner checkout no longer exists on disk (its worktree was
  removed, etc.). The app entry is not auto-removed; run `repoos tunnel
  destroy <name>` from ANY repo — when the name isn't in that repo's own
  repoos.toml, `destroy` looks it up in the registry instead, and if its
  `ownerRoot` is confirmed gone, removes the registry-only entry (with its
  Access app/policy) directly. A checkout that's still on disk always has to
  be destroyed from there, not from elsewhere.
- **origin up/down** (`status` only) — whether anything is listening on the
  app's local service port right now, independent of whether the public
  hostname resolves.

## Code map

- `src/core/tunnel-registry.ts` — pure(ish) registry logic: parse/serialize
  the registry TOML (dropping any entry with an empty hostname/service rather
  than rendering a blank ingress rule), `reconcileIdentity` (conflict
  detection), `syncFromRepo` (seed new apps / re-upsert ones this repo owns
  when repoos.toml changed / drop ones this repo no longer declares —
  `ownerRoot` gates every case so another repo's entries are never touched),
  `unionApps` (the shape `renderCloudflaredConfig` expects), `annotateStale`,
  and `withRegistryLock` (a `.lock`-file mutex so two `repoos tunnel`
  processes can't race a read-modify-write and drop each other's change).
- `src/core/tunnel.ts` — unchanged per-repo `[tunnel]` logic
  (`renderCloudflaredConfig`, `readTunnelConfig`/`writeTunnelConfig`, etc.);
  the registry module builds on top of it.
- `src/core/net-probe.ts` — the tiny local-port reachability check shared by
  the CLI's `tunnel status` and the server's `/api/tunnel/readiness`.
- `src/commands/tunnel.ts` — `mutateRegistry` (mutating commands: lock +
  reconcile + sync + persist, fails loudly on conflict) and
  `readRegistryForDisplay` (read-only: same reconcile + sync, no lock, never
  persists, reports conflicts instead of failing) wire the registry into
  every subcommand. `destroy` falls back to removing a registry-only entry
  when its owning checkout no longer exists on disk (the only case a normal
  `destroy`, which needs that repo's own repoos.toml, can't reach).
- `src/server/server.ts` `tunnelReadiness` — feeds the Cloudflare publishing
  assistant drawer; reports the machine-wide `publishedHostnames` union, not
  just the current repo's, and prefers this repo's own `tunnel.apps` over its
  same-named registry copy so a not-yet-synced hand-edit still shows fresh.
