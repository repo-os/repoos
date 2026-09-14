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
updated_at: "2026-09-14T02:47:18Z"
---
## Why a new page, not an extension of Releases

Releases (`docs/releases.md`, `src/server/release.ts`) models a single-branch, single-artifact, version-tagged release (git tag → GitHub Release). That's the right shape for shipping RepoOS itself as a CLI/binary, but it's the wrong shape for tracking "what's deployed where":

- **N services** × **M environments** × **branches**, each on a provider (Cloudflare Pages, Railway, etc.)
- No version number or tag involved — CI just deploys whatever lands on the branch.
- RepoOS's own UI is not deployed anywhere, but `repoos.org` and `docs.repoos.org` will be.

Deployments needs a **grid**, not a single current-version card.

## Shape

Config-driven and opt-in, same pattern as `[release]` in `repoos.toml` gating the Releases nav item (`nav.ts`): add a `[[deployments]]` array that gates a new "Deployments" nav item only when present, so a repo with no deployments (most projects) sees nothing new.

```toml
[[deployments]]
name     = "Landing page (prod)"
branch   = "main"
provider = "cloudflare-pages"
url      = "https://repoos.org"

[[deployments]]
name     = "Landing page (dev)"
branch   = "prod"
provider = "cloudflare-pages"
url      = "https://landing-dev.repoos.org"

[[deployments]]
name     = "Docs (prod)"
branch   = "main"
provider = "cloudflare-pages"
url      = "https://docs.repoos.org"

[[deployments]]
name     = "Docs (dev)"
branch   = "prod"
provider = "cloudflare-pages"
url      = "https://docs-dev.repoos.org"
```

One row per (service, branch) pair — so a service's dev and prod deploys are two rows, not two features.

v1: pure config + links, no polling — zero new runtime dependencies, consistent with RepoOS's zero-dependency core. A later pass could add live status via a plain `fetch()` against each provider's API or the URL itself for a health check, still no new dependency either way.

Once the landing/docs sites exist (#0338, #0339), use this repo's own `repoos.toml` as the first real config to validate the schema against — same dogfooding approach as everything else in this repo.

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

## Per-branch status + deploy actions

Add a section showing, per branch this repo's deployments key off (main, prod):

- Ahead/behind count vs the branch's own origin ref (`git rev-list --count origin/<branch>..<branch>` and the reverse) -- this is exactly the "local main is 66 commits ahead of origin/main" situation from today, which is the NORMAL state for this repo (local main advances all session, gets pushed in a batch), not an edge case to handle poorly.
- "Deploy main" button -> `git push origin main`.
- "Deploy prod" button -> fast-forward prod to main, then push (`git merge --ff-only main` on a prod checkout/worktree, then `git push origin prod`) -- i.e. automate exactly the two commands run by hand today.

## This is shared branch state, not per-row -- don't duplicate it

Landing (dev) and Docs (dev) both key off `main`; landing (prod) and docs (prod) both key off `prod`. The ahead/behind numbers and the deploy buttons are IDENTICAL for every row sharing a branch and clicking one affects every service on that branch, not just one row. Show this as a per-branch summary (e.g. above or beside the grid), not duplicated per service row -- a naive per-row implementation would show 2 identical "Deploy main" buttons that do the same thing, which is confusing about blast radius.

## Safety -- these are real pushes to a shared GitHub repo, treat them accordingly

- Explicit confirm before either action fires, "Deploy prod" especially since that's a production push.
- Refuse and surface an error (never force-push) if the push isn't a clean fast-forward -- e.g. `prod` genuinely diverged, or `origin/main` moved since the page loaded. Same principle as the mergeBranch/detectDroppedMerge guards in the close-out pipeline: fail loudly, never silently overwrite or discard commits.
- Refuse if the local checkout is dirty (uncommitted changes) with a clear message, same as `just release`'s dirty-tree guard.
- No new credentials needed -- this is plain git against the already-configured `origin` remote, nothing Cloudflare-specific.

## Cloudflare dashboard links

Nick wants a one-click link to watch a deploy happening, e.g.
`https://dash.cloudflare.com/<account-id>/workers/services/view/<worker-name>/production/deployments`.
The account ID is account-specific and there's no Cloudflare API call in this feature (deliberately, see the "no live polling" notes above), so this can't be derived automatically -- add an optional `dashboard_url` field per `[[deployments]]` entry that the user fills in by hand once (copied from their own browser address bar), rendered as a link alongside the site URL. Don't guess the URL shape for non-production branches (unconfirmed whether Cloudflare exposes a separate deployments view per branch) -- let the config carry whatever URL the user actually finds.
