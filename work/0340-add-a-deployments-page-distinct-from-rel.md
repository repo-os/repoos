---
id: "0340"
title: Add a Deployments page (distinct from Releases)
type: feature
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-13T04:13:55Z"
updated_at: "2026-09-13T06:30:01Z"
---
Blocked on #0338 (repoos.org landing page) and #0339 (docs.repoos.org
VitePress site) actually existing with real branch/deploy wiring -- don't
start until both are live, so the config schema is designed against real
CI/provider details instead of guesses.

## Why a new page, not an extension of Releases

Releases (docs/releases.md, src/server/release.ts) models a single-branch,
single-artifact, version-tagged release (git tag -> GitHub Release). That's
the right shape for shipping RepoOS itself as a CLI/binary, but it's the
wrong shape for tracking "what's deployed where": N services (RepoOS's own
UI is not deployed anywhere, but repoos.org and docs.repoos.org will be) x M
environments (dev/prod) x branches, each on a provider (Cloudflare Pages,
Railway, etc.) with no version number or tag involved -- CI just deploys
whatever lands on the branch. Deployments needs a grid, not a single current-
version card.

## Shape

Config-driven and opt-in, same pattern as `[release]` in repoos.toml gating
the Releases nav item (nav.ts) -- add a `[[deployments]]` array that gates a
new "Deployments" nav item only when present, so a repo with no deployments
(most projects) sees nothing new:

    [[deployments]]
    name     = "Landing page"
    branch   = "main"          # or "prod"
    provider = "cloudflare-pages"
    url      = "https://dev.repoos.org"

    [[deployments]]
    name     = "Docs"
    branch   = "main"
    provider = "cloudflare-pages"
    url      = "https://dev-docs.repoos.org"

One row per (service, branch) pair, so a service's dev and prod deploys are
two rows, not two features.

v1: pure config + links, no polling -- zero new runtime dependencies,
consistent with RepoOS's zero-dependency core. A later pass could add live
status via a plain `fetch()` against each provider's API or the URL itself
for a health check, still no new dependency either way.

Once RepoOS's own landing/docs sites exist (#0338, #0339), use this repo's
own repoos.toml as the first real config to validate the schema against,
same dogfooding approach as everything else in this repo.

## Activity

- 2026-09-13T04:13:55Z · created · unknown
- 2026-09-13T06:30:01Z · note: URL correction: don't use dev.repoos.org for the landing page's dev env — it's already the Cloudflare Tunnel hostname for RepoOS's own live dev instance (repoos.toml:78, referenced by the mobile app as its canonical connect-URL example). Use this naming instead: repoos.org (landing prod), landing-dev.repoos.org (landing dev), docs.repoos.org (docs prod), docs-dev.repoos.org (docs dev). Update the [[deployments]] example config in this task's body to match when implementing.
