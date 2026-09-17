# Deployments and releases

Both of these surfaces are **opt-in and off by default**. A repo with no
`[release]` block and no `[[deployments]]` rows shows no Releases or Deployments
item in the navigation, and exposes no release or deploy action — the features
are entirely dormant. This page covers what you get once you configure them.

The two solve different problems: a **release** is one versioned artifact; a
**deployment** is a service tracking a branch. They're independent — configure
one, the other, or both.

## Releases

The only provider is `git-tag`, and it deliberately stays small: after a green
set of passing checks, RepoOS bumps the version, pushes the branch and an annotated tag, and
**your CI does the actual build and publish**. RepoOS never builds the GitHub
release itself, which is what lets it stay dependency-free.

```toml
[release]
enabled     = true
provider    = "git-tag"
branch      = "main"          # the trunk a release ships from
versionFile = "package.json"  # file holding the semantic version
tagPrefix   = "v"
remote      = "origin"
```

The full field list and defaults are in
[Configuration → Releases](/configuration#releases). The `Releases` nav item
only appears when `release.enabled = true`.

### The Releases page

It shows the version RepoOS would ship, the latest tag and when/where it was cut,
the latest *stable* tag, and any blockers. A release can't be cut unless:

- the checkout is on the configured `branch`,
- the working tree is clean, and
- the tag doesn't already exist.

Cutting a release asks you to confirm the exact tag, then runs the same checks as
task close-out: bump the version file, commit it, rebuild, run `repoos check`,
push the branch, create the annotated tag, and push the tag. If the tag push
fails, the local tag is removed so nothing is left half-done. Pushing the tag is
what triggers your CI workflow.

Tags with a suffix — `v1.2.0-beta.1`, `v1.2.0-rc.1` — are treated as
**prereleases**: they're flagged as such on GitHub so `GET /releases/latest`
never hands a prerelease to a stable user, and they don't hide the last stable
tag in the UI.

## Deployments

Deployments model a grid of services: one `[[deployments]]` row per
service-and-branch, where each branch is an environment (a `main` row is
dev/staging, a `prod` row is production, and so on).

```toml
[[deployments]]
name          = "Dashboard (prod)"
branch        = "prod"
provider      = "cloudflare-workers"
url           = "https://app.example.com"
dashboard_url = ""            # optional; paste from the provider dashboard
subdir        = "app"         # optional; scopes freshness to this tree

[[deployments]]
name     = "Dashboard (dev)"
branch   = "main"
provider = "cloudflare-workers"
url      = "https://main-app.example.workers.dev"
subdir   = "app"
```

`url` is the live link, `provider` is a plain label for you, and `subdir` scopes
the "last push" lookup to the part of the repo that row deploys. `dashboard_url`
is optional and manual — RepoOS doesn't call any provider API.

### The Deployments page

For each row it links to the live URL, shows the last commit that touched the
row's `subdir`, and shows branch health against `origin` (how far ahead or
behind). Deployment is plain git: **Deploy** pushes the branch to `origin`, and
the git-connected provider (for example Cloudflare Workers) rebuilds from that
push. RepoOS doesn't confirm whether the provider's build succeeded — the push is
the end of its involvement.

A deploy fast-forwards first when it safely can: if a branch is strictly behind
another configured branch (a `prod` row behind `main`), RepoOS fast-forwards the
local branch to that source before pushing. There is no force-push path — if the
branches have diverged, the deploy fails loudly with git's own refusal rather
than overwriting anything. A checkout with uncommitted changes can't deploy at
all.

Both surfaces read from the **main checkout**, even when the server is serving a
preview from a task worktree, because branch health and dirty state belong to the
checkout you actually manage.
