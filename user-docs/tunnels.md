# Tunnels

`repoos tunnel` publishes a local RepoOS instance to the internet through a
**Cloudflare Tunnel**, guarded by **Cloudflare Access**. Use it to reach your
board from another machine or from the [mobile app](#the-mobile-app).

One machine runs **one** Cloudflare Tunnel with many hostname → local-service
routes. Every RepoOS repo on the machine can publish its own apps into that one
tunnel; RepoOS keeps a machine-level registry so repos don't clobber each other.

## Prerequisites

- `cloudflared` (RepoOS offers to install it via Homebrew on macOS during
  setup).
- A Cloudflare account with a domain.
- A Cloudflare API token, either in the `CLOUDFLARE_API_TOKEN` environment
  variable (e.g. in `.env`) or entered interactively during setup.

## Setup

```bash
repoos tunnel setup
```

This installs/checks `cloudflared`, runs the Cloudflare login, creates a tunnel
(named `repoos-<machine-hostname>` by default), and stores your API token. Setup
also writes the tunnel identity into the machine registry, so a second repo on
the same box joins the same tunnel instead of creating its own.

## Publishing an app

```bash
repoos tunnel create dashboard --port 3000 --allow alice@example.com
```

| Flag | Meaning |
| --- | --- |
| `--port <port>` | The local service to route to (required). |
| `--domain <hostname>` | Explicit public hostname. Otherwise inferred as `<name>.<base-domain>` from setup. |
| `--allow <emails>` | Comma-separated email allowlist for the Access policy. |
| `--no-access` | Create no Access policy at all, relying solely on RepoOS's own auth. |

Apps are **deny-all by default**: an app with an empty allowlist is reachable by
nobody through Access. There is no path to a publicly reachable app through the
normal create flow unless you explicitly pass `--no-access`.

`create` records the app in two places: your repo's `repoos.toml` (the
git-tracked record of what *this* repo publishes) and the machine registry.
App names are shared machine-wide, so `create` fails if another repo already
owns that name.

## Managing apps

```bash
repoos tunnel allow dashboard carol@example.com
repoos tunnel deny  dashboard carol@example.com
repoos tunnel rename old-name new-name
repoos tunnel destroy dashboard
```

`destroy` removes the app from your repo and from the machine registry. If the
owning checkout is gone from disk, you can destroy its registry entry from any
repo.

## Running cloudflared

```bash
repoos tunnel install   # install cloudflared as a system service (survives reboot)
repoos tunnel start     # run it in the foreground for a quick session
repoos tunnel stop
```

`install` and `start` render cloudflared's ingress from the registry's **union
of every app** on the machine, so running `install` from any one repo brings up
ingress for every app any repo has published.

## Inspecting state

```bash
repoos tunnel list      # every app on the machine, with its owning repo
repoos tunnel status    # adds whether each app's local origin is currently up
```

Both are machine-wide views. Each app is annotated with its owner repo, whether
that checkout still exists (`stale`), and whether anything is listening on its
local service port.

## The mobile app

The RepoOS mobile app is a native shell around the ordinary web UI: it stores a
list of servers on-device and opens the selected one, chromeless, in an isolated
WebView. Add a server by its published `https://…` URL — the app only accepts
HTTPS and verifies the server answers `/api/health` before saving it.

One caveat when publishing for the app: **Cloudflare Access in front of a
tunnel** can degrade inside an embedded WebView (some identity providers block
embedded sign-in; device-posture checks may not surface). A tunnel created with
`--no-access`, relying on RepoOS's own login, is fully compatible with the app.
