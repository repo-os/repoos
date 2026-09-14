# Deployments

Written 2026-09-14 (task #0340). How RepoOS tracks **what's deployed where** —
the surface that is deliberately distinct from [Releases](releases.md).

## Why a separate page

Releases models a single-branch, single-artifact, version-tagged release (git
tag → GitHub Release). That's the right shape for shipping RepoOS itself as a
CLI, and the wrong shape for "what's deployed where": a repo can have N
services × M environments × branches, each on a provider, with **no version
number involved** — CI just deploys whatever lands on the branch. Deployments
is a grid of those (service, branch) pairs; Releases stays a single
current-version card.

The feature is config-driven and opt-in, like `[release]`: without a
`[[deployments]]` array in `repoos.toml`, the nav item and API don't exist for
that repo.

## Configuration

```toml
# repoos.toml — one block per (service, branch)
[[deployments]]
name          = "Landing page (prod)"
branch        = "prod"
provider      = "cloudflare-workers"   # plain label; no live API in v1
url           = "https://repoos.org"   # rendered as the row's primary link
dashboard_url = ""                     # optional; paste from the provider dashboard
subdir        = "landing"              # scopes the freshness lookup to this tree
```

- **`main` = dev/staging, `prod` = production** (this repo's convention; other
  repos may use any branch names — nothing is hardcoded).
- `provider` is a plain label with zero special-casing. Everything else is
  plain git against the configured `origin` remote, so GitHub, GitLab, or any
  git host works identically.
- **Every `url` (and `dashboard_url` when present) renders as a clickable
  link.** The page exists so the operator never has to remember or type these
  URLs; inert text would defeat it.
- `dashboard_url` is account-specific and cannot be derived — the user pastes
  it in once. Empty means the link is hidden.
- `subdir` scopes the freshness lookup (below). Omit it for a branch-wide
  signal.

This repo's own `repoos.toml` is the reference config: four rows (landing and
docs sites, each with prod and dev on `prod`/`main`), deployed as Cloudflare
Workers via `wrangler.jsonc` in `landing/` and `user-docs/`.

## Freshness (v1: last push, not build status)

Each row shows the last commit pushed to its branch **scoped to its own
subdirectory**: `git log -1 <branch> -- <subdir>` — timestamp + short SHA.
Scoping matters: an unrelated push to the branch that touches neither
`landing/` nor `user-docs/` must not read as a deploy of a service that didn't
change (the same blind spot as Cloudflare's build watch paths).

The UI says this plainly: it reflects the last **push**, not confirmed build
success — a broken provider build still shows a fresh timestamp while the live
site serves an older version. Genuine build-status would need a provider API
token (env-only, read server-side, like `REPOOS_AUTH_DEV_BACKDOOR_CODE`) —
deliberately deferred to v2.

## Per-branch deploy actions

When deploying **is** pushing to GitHub (the provider rebuilds on push), the
page offers to do the push, not just link to the result. One summary per
distinct branch derived from the configured rows — never per row — shows:

- Ahead/behind vs the branch's own `origin` ref. Local `main` running tens of
  commits ahead of `origin/main` is the normal working state here, not an
  anomaly.
- A **Deploy button**. There are exactly two behaviors, chosen by actual git
  topology (`fastForwardSource`, `src/server/deployments.ts`) — no branch-name
  constants:
  - **Plain push** (`git push origin <branch>`) for a branch that is not
    strictly behind another configured branch — e.g. `main`.
  - **Fast-forward + push** for a branch that is strictly behind another
    configured branch (nearest descendant wins): `git fetch . <src>:<branch>`
    (git refuses non-fast-forward ref updates), then
    `git push origin <branch>` — e.g. prod ← main. After a deploy, when both
    branches are equal, the next deploy is a plain push again.

Because the numbers and buttons are shared by every service on that branch,
they're shown once per branch; clicking one deploys **every** service on that
branch. That blast radius is stated in the confirm dialog.

## Safety

These are real pushes to a shared remote:

- Explicit confirmation before either action fires.
- The checkout's uncommitted changes block every deploy (same dirty-tree guard
  as `just release`).
- There is no force-push path. Every non-fast-forward case — diverged local
  branches, or `origin` moving since the page loaded — fails loudly with git's
  own refusal in the output (`deployBranch`, `src/server/deployments.ts`).
- No new credentials: plain git against the already-configured `origin`.

Deploys run against the **main checkout** even when the server is serving a
task preview from a linked worktree (`deployRoot` resolves the main checkout,
same rule as board reads) — branch refs are shared, but dirty-state and
branch health belong to the checkout the user manages.

## API

- `GET /api/deployments` — rows with freshness + per-branch ahead/behind.
- `POST /api/deployments/deploy` `{ branch }` — runs the deploy; refuses with
  HTTP 409 and a human-readable `output` when the repo state doesn't allow it.
