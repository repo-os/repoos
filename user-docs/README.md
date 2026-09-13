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

## Adding a page

The sidebar is **hand-curated** in `.vitepress/config.mts` — VitePress does not
generate it from the file tree. A new page must be added to
`themeConfig.sidebar` or it won't appear in navigation, even though it still
builds and is reachable by direct URL.

## Deploy (Cloudflare Pages)

Cloudflare Pages project, DNS and custom domains are manual dashboard work.
The convention, matching repoos.org (`landing/`):

| Branch | Environment | Domain |
| --- | --- | --- |
| `main` | dev/staging | `docs-dev.repoos.org` |
| `prod` | production | `docs.repoos.org` |

`prod` advances only as an infrequent, deliberate fast-forward merge of `main`.

Cloudflare Pages settings:

- **Root directory:** `user-docs`
- **Build command:** `bun install && bun run build`
- **Output directory:** `.vitepress/dist` (relative to the root directory above)
- **Build watch paths:** `user-docs/**` — without this, Cloudflare rebuilds this
  site on *every* push to a watched branch, including pushes that touch nothing
  here.
- Clean URLs are enabled (`cleanUrls: true`); Cloudflare Pages serves `foo.html`
  at `/foo` natively, so no `_headers`/`_redirects` file is needed.
