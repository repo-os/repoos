# user-docs — docs.repoos.org

Documentation for **people using RepoOS** in their own repos: install, the task
lifecycle, CLI, configuration. Published as a VitePress site at
docs.repoos.org.

Standalone sibling project (own `package.json`, no bun workspaces — same
pattern as `landing/` and `mobile/`).

## Not to be confused with `../docs/`

| | Audience | Contents |
| --- | --- | --- |
| `user-docs/` (here) | People **using** RepoOS | How to install it, run it, and work with it in your own repo |
| `../docs/` | People (and agents) **building** RepoOS | Architecture, decisions, incident history, rationale — the build context for this project |

`docs/` is a RepoOS convention, not just a folder this repo happens to have:
`repoos init` creates it (`config.docsDir`) in every repo RepoOS manages, and
the scaffolded `AGENTS.md` tells agents to read it before starting work. In a
repo running RepoOS, `docs/` is *that* project's context. Here it's RepoOS's
own.

The two overlap in subject matter but not in purpose, and they are expected to
diverge — a user-facing "Concepts" page is written for someone adopting the
tool, not for someone debugging its close-out pipeline. **Don't publish
`../docs/` here, and don't move build-context notes into this directory.**

## Local development

```bash
just user-docs-dev    # from repo root — dev server at http://localhost:5175
just user-docs-build  # from repo root — static build to .vitepress/dist
```

Or run it directly:

```bash
cd user-docs
bun install
bun run dev      # defaults to port 5173, which repoos-ui-dev already uses —
                  # pass `-- --port 5175` (what just user-docs-dev does)
bun run build    # static build to .vitepress/dist
bun run preview  # serve the built site
```

## Theme switcher

The docs site uses the same two-axis model as [repoos.org](https://repoos.org):

| Axis | DOM | Storage key | Values |
| --- | --- | --- | --- |
| **Design theme** | `data-ui-theme` on `<html>` (omitted for Classic) | `repoos-ui-theme` | `classic`, `gruvbox` |
| **Appearance** | `dark` class on `<html>` (VitePress convention) | `repoos-theme` | `dark`, `light` |

A synchronous boot script in every page's `<head>` applies both axes before first
paint (see `.vitepress/theme/theme-boot.ts` and `vite-plugin-theme-boot.ts`).
VitePress's built-in appearance toggle is disabled so there is a single control in
the navbar (desktop) and mobile nav screen.

### Shareable URLs and cross-site hand-off

| Param | Values | Example |
| --- | --- | --- |
| `theme` | `classic`, `gruvbox`, or any future design id | `?theme=gruvbox` |
| `appearance` | `dark`, `light` | `?appearance=light` |
| `mode` | alias for `appearance` | `?theme=gruvbox&mode=light` |

Resolution order per axis: **URL → `localStorage` → default** (Classic design;
appearance defaults to **dark**, matching the previous `appearance: "dark"`
config). Using the switcher updates the URL with `history.replaceState`.

**Landing → docs:** `repoos.org` and `docs.repoos.org` are different origins, so
`localStorage` does not cross between them. Docs links from the landing page append
`?theme=` / `?appearance=` on click; that query string is what carries your choice
across. The same keys are still written on each site so a return visit to either
origin remembers your last pick there.

Parsing rules mirror `landing/src/theme-resolve.ts` (duplicated in
`.vitepress/theme/theme-resolve.ts` — keep them in sync). Unknown but valid-shaped
`?theme=` values fall back to Classic until CSS exists for that id.

## Adding a page

The sidebar is **hand-curated** in `.vitepress/config.mts` — VitePress does not
generate it from the file tree. A new page must be added to
`themeConfig.sidebar` or it won't appear in navigation, even though it still
builds and is reachable by direct URL.

## The changelog page fetches from GitHub at build time

`/changelog` (`changelog.md` + `changelog.data.ts`) embeds the most recent
GitHub Releases via a VitePress **data loader**, so the fetch runs once per
build (and per dev-server start), not in a visitor's browser. It reads the
unauthenticated public Releases API — no token needed — and renders each
release's markdown body with VitePress's own markdown renderer, then links out
to the full history for anything older.

Two consequences worth knowing:

- **The build needs network access to `api.github.com`.** If the fetch fails
  (offline build, rate limit), the data loader returns an error object instead
  of throwing, and the page degrades to just the link-out — the docs build
  never fails over it. Unauthenticated rate limit is 60/hour; add
  `GITHUB_TOKEN` only if the build ever actually hits it.
- The page is a **snapshot from deploy time**, not live. That is why the link
  to the GitHub Releases page is always present alongside the embed.

## Deploy (Cloudflare)

Cloudflare's project, DNS and custom domains are manual dashboard work. The
convention, matching repoos.org (`landing/`):

| Branch | Environment | Domain |
| --- | --- | --- |
| `main` | dev/staging | `docs-dev.repoos.org` |
| `prod` | production | `docs.repoos.org` |

`prod` advances only as an infrequent, deliberate fast-forward merge of `main`.

`user-docs/macos-hub.md` is the RepoOS Hub for Mac guide. Publish the docs site
from `main` to `prod` before linking users to it from public release copy.

Cloudflare's dashboard now creates git-connected static sites as **Workers**
(`wrangler deploy`), not the older "Pages project" flow — deployment is driven
by `wrangler.jsonc` in this directory. In the "Create an app" wizard:

- **Build command:** `bun install && bun run build`
- **Deploy command:** leave the default (`npx wrangler deploy`)
- **Path** (under Advanced settings): `user-docs`
- **Builds for non-production branches:** on
- **Production branch:** `prod` (set wherever the wizard's repo-selection step
  asks for it)
- **API token:** let it auto-create one

Whether the "Path" field also scopes *which pushes* trigger a build (replacing
what used to be a separate "Build watch paths" field on classic Pages), or
whether that's a distinct Advanced setting, wasn't confirmed as of this
writing — check the dashboard directly. Without some form of path scoping,
Cloudflare rebuilds this site on every push to a watched branch, including
ones that touch nothing here.

VitePress builds with `cleanUrls: true` (`foo.html` served at `/foo`);
`wrangler.jsonc`'s default `html_handling` already matches that, so no
`_headers`/`_redirects` file is needed. Verify locally before deploying:
`cd user-docs && bunx wrangler deploy --dry-run`.
