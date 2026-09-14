---
id: "0340"
title: Add a Deployments page (distinct from Releases)
type: feature
status: ready
priority: p3
area: web
assigned_to: ai
created_by: ""
branch: ""
pm_model_override: opencode-go/hy3
review_model_override: opencode-go/deepseek-v4-pro
created_at: "2026-09-13T04:13:55Z"
updated_at: "2026-09-14T05:32:04Z"
---
## Why a new page, not an extension of Releases

Releases (`docs/releases.md`, `src/server/release.ts`) models a single-branch, single-artifact, version-tagged release (git tag → GitHub Release). That's the right shape for shipping RepoOS itself as a CLI/binary, but it's the wrong shape for tracking "what's deployed where":

- **N services** × **M environments** × **branches**, each on a provider.
- No version number or tag involved — CI just deploys whatever lands on the branch.
- RepoOS's own UI is not deployed anywhere, but `repoos.org` and `docs.repoos.org` are (both live as of 2026-09-14).

Deployments needs a **grid**, not a single current-version card.

## Config shape

Config-driven and opt-in, same pattern as `[release]` in `repoos.toml` gating the Releases nav item (`nav.ts`): add a `[[deployments]]` array that gates a new "Deployments" nav item only when present, so a repo with no deployments (most projects) sees nothing new.

This repo's real config, verified against the actual live setup (2026-09-14) — use this, not an invented example:

```toml
[[deployments]]
name          = "Landing page (prod)"
branch        = "prod"
provider      = "cloudflare-workers"
url           = "https://repoos.org"
dashboard_url = ""  # fill in from the Cloudflare dashboard's address bar

[[deployments]]
name          = "Landing page (dev)"
branch        = "main"
provider      = "cloudflare-workers"
url           = "https://main-repoos-landing.njachowski.workers.dev"
dashboard_url = ""

[[deployments]]
name          = "Docs (prod)"
branch        = "prod"
provider      = "cloudflare-workers"
url           = "https://docs.repoos.org"
dashboard_url = ""

[[deployments]]
name          = "Docs (dev)"
branch        = "main"
provider      = "cloudflare-workers"
url           = "https://main-repoos-docs.njachowski.workers.dev"
dashboard_url = ""
```

Notes on why this is the correct shape (don't relitigate these, they're settled):

- **`main` = dev/staging, `prod` = production.** Not the other way round.
- **`provider = "cloudflare-workers"`, not `"cloudflare-pages"`.** Cloudflare's dashboard now creates git-connected static sites as Workers (`wrangler deploy` + a `wrangler.jsonc` in each of `landing/` and `user-docs/`), not the classic Pages project flow. There's no root-directory/output-directory pair to configure — `wrangler.jsonc` (`name`, `assets.directory`) is the actual source of truth for what gets deployed, and is what any future richer integration should read from.
- **Custom domains only attach to a Worker's PRODUCTION branch deployment.** Cloudflare doesn't support custom domains on non-production branch previews (confirmed 2026-09-14, open upstream feature request). So `prod` gets the real custom domain; `main` gets the auto-generated, per-branch-stable Workers preview URL (pattern: `https://<branch>-<worker-name>.<account-subdomain>.workers.dev`). That preview URL is a stable alias tied to the branch name, not a one-off per-deploy link — safe to hardcode in config. `landing-dev.repoos.org` / `docs-dev.repoos.org` are NOT used — deliberately decided against a Cloudflare Redirect Rule to alias them, since the workers.dev links cost nothing extra to use directly.
- **One row per (service, branch) pair** — a service's dev and prod deploys are two rows, not two features.
- **`dashboard_url` is optional and manual.** It's account-specific (e.g. `https://dash.cloudflare.com/<account-id>/workers/services/view/<worker-name>/production/deployments`) and there's no Cloudflare API call in this feature, so it can't be derived — the user pastes it in once. Don't guess the URL shape for non-production branches; whatever the user finds is what goes in config.

**Explicit product requirement:** the entire point of this page is that the user never has to remember or type any of these URLs. Every row's `url` must render as a clickable link that opens the live site directly. Same for `dashboard_url` when present. Do not ship a version that displays either as inert text.

## Freshness signal (still v1 — no live polling, no new credentials)

Per (service, branch) row, show the last commit pushed to that branch, **scoped to the service's own subdirectory**: `git log -1 -- <subdir> <branch>` (e.g. `git log -1 -- landing main`, `git log -1 -- user-docs main`) — timestamp + short SHA. Not `git log -1 <branch>` alone: an unrelated push to the branch that touches neither `landing/` nor `user-docs/` would otherwise show a misleadingly recent timestamp for a service that didn't actually change (the exact same blind spot as Cloudflare's per-project Build Watch Paths / Path setting).

State plainly in the UI copy that this reflects the last **push**, not confirmed build success — a broken Cloudflare build would still show a recent timestamp while the live site serves an older version. Getting genuine build-success status would need Cloudflare's Workers/Pages deployments API and a real (if narrow, read-only) API token — deliberately deferred to v2. If ever built, that token belongs in `.env`, read server-side only, same pattern as `REPOOS_AUTH_DEV_BACKDOOR_CODE` — never exposed to a coding agent.

## Per-branch status + deploy actions

This repo's actual deploy mechanism *is* pushing to GitHub (Cloudflare rebuilds automatically on push to a watched branch), so the page should offer to do that push, not just link to the result.

Add a section — **per branch** (`main`, `prod`), not per row, see below — showing:

- Ahead/behind count vs the branch's own origin ref: `git rev-list --count origin/<branch>..<branch>` and the reverse. Local `main` running significantly ahead of `origin/main` (tens of commits) is the **normal** state for this repo — work accumulates locally across a session and gets pushed in a batch — not an edge case to handle awkwardly.
- **"Deploy main" button** → `git push origin main`.
- **"Deploy prod" button** → fast-forward `prod` to `main`, then push: `git merge --ff-only main` (on a `prod` checkout/worktree), then `git push origin prod`. This automates exactly the two commands run by hand today.

**This is shared branch state — don't duplicate it per row.** Landing (dev) and Docs (dev) both key off `main`; landing (prod) and docs (prod) both key off `prod`. The ahead/behind numbers and the deploy buttons are identical for every row sharing a branch, and clicking one affects every service on that branch, not just one row. Show this as a per-branch summary (above or beside the grid) — a naive per-row implementation would show duplicate buttons that do the same thing, which misrepresents the actual blast radius.

**Safety — these are real pushes to a shared GitHub repo:**

- Explicit confirmation before either action fires; "Deploy prod" especially, since that's a production push.
- Refuse and surface a clear error — never force-push — if the push isn't a clean fast-forward (e.g. `prod` genuinely diverged, or `origin/main` moved since the page loaded). Same fail-loudly-never-silently-discard principle as the close-out pipeline's merge guards (`docs/close-out-pipeline.md`).
- Refuse if the local checkout is dirty (uncommitted changes), with a clear message — same as `just release`'s dirty-tree guard.
- No new credentials needed — this is plain git against the already-configured `origin` remote, nothing Cloudflare-specific.

## Verification

Once `landing/` and `user-docs/` exist with real branches (true as of 2026-09-14), use this repo's own `repoos.toml` as the first real config to validate the schema against — same dogfooding approach as everything else here. `repoos check` does not exercise this page's actual Cloudflare-facing behavior (it has no way to verify a real push landed or a real site is live) — verify by hand: trigger "Deploy main" against a real (or throwaway) branch state and confirm the push actually happened and the buttons' safety guards actually refuse a non-fast-forward case.

## Activity

- 2026-09-13T04:13:55Z · created · unknown
- 2026-09-13T06:30:01Z · note: URL correction: don't use dev.repoos.org for the landing page's dev env — it's already the Cloudflare Tunnel hostname for RepoOS's own live dev instance (repoos.toml:78, referenced by the mobile app as its canonical connect-URL example). Use this naming instead: repoos.org (landing prod), landing-dev.repoos.org (landing dev), docs.repoos.org (docs prod), docs-dev.repoos.org (docs dev). Update the [[deployments]] example config in this task's body to match when implementing.
- 2026-09-13T06:47:17Z · note: Blocking condition loosened: this only needs landing/ and docs/ to exist as real directories with known branch names (from #0338/#0339) — it does NOT need live Cloudflare deploys to be wired up first. The config schema (name/branch/provider/url) and URL convention are already settled in prior notes, and v1 is deliberately config+links only (no live polling), so there's nothing left that depends on the sites actually being deployed yet.
- 2026-09-13T08:35:56Z · status inbox→ready
- 2026-09-13T08:36:03Z · pm_model_override
- 2026-09-13T08:36:10Z · review_model_override
- 2026-09-13T09:24:24Z · body
- 2026-09-13T09:24:28Z · note: No longer blocked: #0338 and #0339 are not done but are on main, and per prior note the blocking condition only needed the landing/ and docs/ directories to exist with known branch names. Spec reformatted for readability and the [[deployments]] example config updated to the corrected URL convention (repoos.org / landing-dev.repoos.org / docs.repoos.org / docs-dev.repoos.org).
- 2026-09-13T09:33:41Z · note: v1 scope refinement (2026-09-13): "no live polling" doesn't mean no freshness signal at all. Show, per (service, branch) row: the configured name/branch/url (as already planned) PLUS the last commit pushed to that branch -- timestamp + short SHA via `git log -1 <branch>` -- as a free, zero-credential proxy for "when was this environment last updated." Every Cloudflare Pages deploy is triggered by a push to a watched branch, so this is a genuine (if imperfect) signal with zero new dependencies or secrets.

Caveat to note in the UI copy: this reflects the last PUSH, not confirmed build success -- a broken Cloudflare build would still show a recent timestamp while the live site serves an older version.

Deliberately deferred to v2, not v1: genuine build-success/deploy-status would need Cloudflare's Pages API (GET .../pages/projects/:name/deployments), which needs a real (if narrow, read-only) API token. That token would live in .env and be read server-side only -- same pattern as REPOOS_AUTH_DEV_BACKDOOR_CODE already uses -- and would never be exposed to a coding agent. Don't bundle this into v1; it's a real secret + live external call for "nice to have" (accurate status) vs. "good enough" (last-pushed timestamp) that costs nothing.
- 2026-09-13T09:40:07Z · note: Correction to the freshness-signal note above: scope it to the site's own subdirectory, not the whole branch -- `git log -1 -- <subdir> <branch>` (e.g. `git log -1 -- landing main`), not `git log -1 <branch>`. Same blind spot as the Cloudflare Build Watch Paths issue: a branch-wide signal doesn't know an unrelated push (e.g. a src/ fix) touched nothing under landing/ or docs/, and would misleadingly show that environment as freshly updated.
- 2026-09-13T15:12:47Z · note: Directory rename (2026-09-13): the VitePress docs site moved from docs/ to user-docs/ — docs/ is reserved for RepoOS-convention build context (see docs/README.md vs user-docs/README.md). So the [[deployments]] example config and the per-row freshness lookup in this task refer to `user-docs`, not `docs`: e.g. `git log -1 -- user-docs main`. The published URLs (docs.repoos.org / docs-dev.repoos.org) are unchanged.
- 2026-09-13T18:15:16Z · note: Correction (2026-09-14): Cloudflare's dashboard now creates git-connected static sites as Workers (wrangler deploy + wrangler.jsonc), not the classic 'Pages project' flow assumed in earlier notes here — no root-directory/output-directory pair, no separate 'Build watch paths' field confirmed to exist (may be folded into the 'Path' Advanced setting, or may not exist at all — check the dashboard). landing/wrangler.jsonc and user-docs/wrangler.jsonc now exist and are the actual source of truth for what gets deployed. Whatever data source #0340 ends up using for 'last deployed', it should read the deploy config from these wrangler.jsonc files (project name, assets directory) rather than assuming Pages-specific fields.
- 2026-09-14T02:33:57Z · note: Major correction to the [[deployments]] example in this task's body (2026-09-14) -- superseding it, don't use it as written:

1. It had branch/label INVERTED: "Landing page (prod)" was given branch="main" and "Landing page (dev)" was given branch="prod" -- backwards from the actual convention (main=dev/staging, prod=production) established for this repo.

2. provider="cloudflare-pages" is stale. Cloudflare's dashboard now creates git-connected static sites as Workers (wrangler deploy + wrangler.jsonc), not Pages -- see the correction note above this one. Use provider="cloudflare-workers".

3. URL scheme changed: custom domains (repoos.org, docs.repoos.org) can ONLY be attached to a Worker's PRODUCTION branch deployment -- Cloudflare does not support custom domains on non-production branch previews (confirmed 2026-09-14, open feature request upstream). So:
   - prod branch -> custom domain (https://repoos.org, https://docs.repoos.org)
   - main branch -> the auto-generated, per-branch-stable Workers preview URL (pattern: https://<branch>-<worker-name>.<account-subdomain>.workers.dev, e.g. https://main-repoos-landing.njachowski.workers.dev) -- NOT landing-dev.repoos.org / docs-dev.repoos.org, which are no longer used. Decided against a Cloudflare Redirect Rule to alias those subdomains to the workers.dev URL (extra zone-level setup for no real benefit) -- ship with the workers.dev links directly.

Corrected config:

    [[deployments]]
    name     = "Landing page (prod)"
    branch   = "prod"
    provider = "cloudflare-workers"
    url      = "https://repoos.org"

    [[deployments]]
    name     = "Landing page (dev)"
    branch   = "main"
    provider = "cloudflare-workers"
    url      = "https://main-repoos-landing.njachowski.workers.dev"

    [[deployments]]
    name     = "Docs (prod)"
    branch   = "prod"
    provider = "cloudflare-workers"
    url      = "https://docs.repoos.org"

    [[deployments]]
    name     = "Docs (dev)"
    branch   = "main"
    provider = "cloudflare-workers"
    url      = "https://main-repoos-docs.njachowski.workers.dev"

Explicit product requirement (Nick, 2026-09-14): the whole point of this page is that Nick should never need to remember or type any of these URLs. Every row must render its url as a clickable link that opens the live site directly -- that's the primary interaction the page exists for, not a nice-to-have. Don't ship a version that just displays the URL as inert text.
- 2026-09-14T02:47:18Z · note: New requirement (Nick, 2026-09-14): for a repo like this one where deploying IS pushing to GitHub (Cloudflare rebuilds on push), the page should show git push status and offer to do the push, not just link to the result.
- 2026-09-14T05:30:42Z · body
- 2026-09-14T05:32:04Z · note: Cross-repo generality check (Nick, 2026-09-14): this needs to work for other repos running RepoOS with different git hosts (e.g. Celleris on GitLab, also deploying to Cloudflare Pages/Workers) and potentially different branch names. Confirmed the mechanism is already host-agnostic -- everything is plain git against the configured 'origin' remote (push, rev-list, log), no GitHub API calls anywhere, so GitLab works identically. provider is a plain label with zero special-casing in v1 (no live API calls to any provider), so it's already generic too.

One real fix to the spec: the per-branch summary section's wording ("per branch (main, prod)") reads as if those two branch names are hardcoded. They must NOT be -- derive the distinct set of branches from whatever's actually present across the configured [[deployments]] rows' branch fields, so a repo using different branch names (or more than two environments) gets a correct summary without any code change. main/prod is this repo's OWN config value, not a constant to bake into the implementation.
