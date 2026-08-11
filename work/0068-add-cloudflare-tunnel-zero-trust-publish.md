---
id: "0068"
title: Add Cloudflare Tunnel + Zero Trust publishing for local apps
type: feature
status: active
priority: p2
area: cli
assigned_to: ai
created_by: ""
branch: feat/add-cloudflare-tunnel-zero-trust-publish
created_at: "2026-08-11T01:44:17Z"
updated_at: "2026-08-11T03:31:21Z"
---
## Problem

There's no way to securely share a locally running web app (e.g.
`http://localhost:3000`) with specific people without the app developer
manually setting up DNS, TLS, a reverse proxy, a VPN, router port forwarding,
and/or application-level authentication. This is high-friction enough that
people either don't share local work at all, or resort to insecure shortcuts
(exposing a port publicly, ad-hoc ngrok links with no access control).
Cloudflare Tunnel + Cloudflare Access already solves this end-to-end — outbound
tunnel from the machine, no open inbound ports, and email-whitelist auth in
front of the app — but wiring it up by hand means running several `cloudflared`
commands, hand-editing YAML, and configuring Access policies in the Cloudflare
dashboard. RepoOS should turn "securely share this local app with these
people" into a single primitive.

## Desired UX

A developer has an app running at `http://localhost:3000` and wants to expose
it at `https://dashboard.repoos.org`, restricted to a specific list of email
addresses.

One-time machine setup:

```bash
repoos tunnel setup
```

This checks whether `cloudflared` is installed (offers to install it if not),
runs/guides the user through `cloudflared tunnel login`, determines the
Cloudflare account/domain, creates (or reuses) a single RepoOS tunnel for this
machine, configures Cloudflare Access with Cloudflare's own identity provider,
persists the resulting non-secret config, and explains how to start the
tunnel. It is idempotent — safe to re-run.

Publishing an app:

```bash
repoos tunnel create dashboard \
  --port 3000 \
  --domain dashboard.repoos.org \
  --allow alice@example.com,bob@example.com
```

If RepoOS has a configured base domain, `--domain` can be omitted and inferred
from the app name (`dashboard` → `dashboard.repoos.org`).

Managing access:

```bash
repoos tunnel allow dashboard alice@example.com
repoos tunnel deny dashboard bob@example.com
```

Running:

```bash
repoos tunnel start     # dev: run cloudflared interactively
repoos tunnel install   # server: install as a persistent service (survives reboot)
repoos tunnel stop
```

Inspecting:

```bash
repoos tunnel list
repoos tunnel status
```

End result: alice and bob open `https://dashboard.repoos.org`, get redirected
to Cloudflare to log in, and — only if their authenticated email is on the
allowlist — get forwarded to `localhost:3000`. Anyone else is denied. The
local app itself never implements auth. No router port forwarding or inbound
firewall rules are needed.

One machine runs **one** Cloudflare Tunnel with multiple hostname → local
service routes, not one tunnel per app:

```text
dashboard.repoos.org → localhost:3000
admin.repoos.org     → localhost:3001
api.repoos.org       → localhost:8080
```

RepoOS config (not `cloudflared`'s own config file) is the source of truth,
e.g.:

```yaml
tunnel:
  provider: cloudflare
  name: repoos-local
  domain: repoos.org
  apps:
    dashboard:
      hostname: dashboard.repoos.org
      service: http://localhost:3000
      access:
        - alice@example.com
        - bob@example.com
```

RepoOS generates/reconciles `cloudflared`'s ingress config and Access policies
from this state, rather than treating hand-edited `cloudflared` YAML as
authoritative.

## Acceptance criteria

- [ ] `repoos tunnel setup` checks for `cloudflared` on PATH, offers to
      install it if missing, drives `cloudflared tunnel login`, creates or
      reuses one tunnel per machine, and persists non-secret tunnel config
      (name, domain, tunnel UUID) to RepoOS's own config — never to
      `cloudflared`'s config as the source of truth. Re-running it is a no-op
      when already set up (idempotent).
- [ ] `repoos tunnel create <name> --port <port> [--domain <hostname>] [--allow <emails>]`
      adds an app entry to RepoOS config, runs the equivalent of
      `cloudflared tunnel route dns <tunnel> <hostname>` to create the DNS
      record, regenerates the tunnel's ingress config from RepoOS state
      (one rule per configured app plus a trailing `http_status:404`
      catch-all), and creates a Cloudflare Access application + policy scoped
      to the allowed emails for that hostname.
- [ ] When `--domain` is omitted and a base domain is configured,
      `<name>.<base-domain>` is inferred automatically.
- [ ] `repoos tunnel allow <name> <email>` and `repoos tunnel deny <name> <email>`
      add/remove an email from that app's allowlist in RepoOS config and
      reconcile the corresponding Cloudflare Access policy.
- [ ] `repoos tunnel start` runs `cloudflared tunnel run <tunnel>` in the
      foreground (dev mode) using the reconciled config.
- [ ] `repoos tunnel install` installs/configures `cloudflared` as a
      persistent OS service (launchd on macOS, systemd on Linux) so the
      tunnel survives reboot; `repoos tunnel stop` stops the running tunnel
      (foreground process or installed service, whichever applies).
- [ ] `repoos tunnel list` shows configured apps with hostname, local
      service, and allowlist. `repoos tunnel status` shows whether the
      tunnel is installed, running, and reachable, plus per-app health.
- [ ] By default, every app created via `repoos tunnel create` is protected
      by a Cloudflare Access policy restricted to its explicit email
      allowlist — there is no way to end up with a publicly reachable app
      with no allowlist through the normal `create` flow.
- [ ] No Cloudflare credentials, tokens, or tunnel secrets are ever written
      into the RepoOS repo or committed to git; they're stored via the OS
      keychain / user secret storage or left in `cloudflared`'s own
      credentials file (`~/.cloudflared/<UUID>.json`) as Cloudflare already
      does.
- [ ] Creating an app with a hostname deeper than one label under the base
      domain (e.g. `dashboard.app.repoos.org`) succeeds but prints a warning
      that the user's Cloudflare SSL/certificate configuration must cover
      that hostname.
- [ ] Works on both macOS and Linux for `setup`, `start`, `install`, and
      `stop`.

## Notes for AI

- This is a CLI feature (`repoos tunnel ...` subcommands) that shells out to
  `cloudflared`; it is not a reimplementation of Cloudflare Tunnel. RepoOS
  orchestrates `cloudflared` commands and generates its config file — it does
  not reimplement the tunnel protocol.
- RepoOS's own persisted config (see YAML shape in Desired UX) is the source
  of truth. The generated `cloudflared` ingress YAML and Cloudflare Access
  policies must be derived/reconciled from it on every `create`/`allow`/`deny`,
  not hand-maintained separately.
- Conceptually automate the equivalent of: `cloudflared tunnel login`,
  `cloudflared tunnel create <name>`, `cloudflared tunnel route dns <name> <hostname>`,
  and generating the `tunnel:`/`credentials-file:`/`ingress:` config consumed
  by `cloudflared tunnel run <name>`.
- Cloudflare's own identity provider is the default/preferred Access identity
  provider — don't build support for other IdPs in this MVP.
- One tunnel per machine, many apps routed through it via ingress rules —
  do not create a new Cloudflare Tunnel per app.
- Assumption (undocumented in the source explanation, flagging as a default):
  exact CLI flags for invoking `cloudflared` (e.g. how account/zone selection
  is surfaced when a Cloudflare account has multiple domains) should follow
  whatever `cloudflared`'s current CLI supports; confirm current `cloudflared`
  CLI syntax/output during implementation since it may have changed since
  this task was written.
- Assumption: persistent service installation should use `cloudflared`'s own
  `cloudflared service install` mechanism where available, rather than RepoOS
  hand-rolling launchd/systemd unit files, unless that mechanism proves
  insufficient.
- Out of scope for this task: abstracting Cloudflare into a generic/pluggable
  networking or tunnel-provider layer. Build directly against Cloudflare
  Tunnel + Access; a provider abstraction is explicitly not required for MVP.
- Do not implement any application-level authentication — auth is entirely
  Cloudflare Access's responsibility, in front of the tunnel.

## Scope

In scope: `repoos tunnel setup|create|allow|deny|start|stop|install|list|status`,
RepoOS-side config persistence and reconciliation, Cloudflare Access allowlist
management, macOS + Linux persistent service installation.

Deferred: multi-provider/non-Cloudflare tunneling, non-email-based Access
rules (e.g. group/IdP-based policies beyond a plain allowlist), Windows
support, per-app custom Access session durations or MFA policy tuning.

## Activity

- 2026-08-11T01:44:17Z · created · unknown
- 2026-08-11T01:44:42Z · status inbox→ready
- 2026-08-11T03:31:21Z · status ready→active, branch
