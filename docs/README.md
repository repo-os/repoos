# docs.repoos.org

RepoOS's documentation site — this directory **is** the site. It republishes
the repo's own `docs/*.md` (architecture, concepts, ADRs, audits) as a
VitePress site. The markdown stays in `docs/` as the single source of truth:
edit a file here, and the site picks it up on the next build.

Standalone sibling project (own `package.json`, no bun workspaces — same
pattern as `mobile/`). Independent of `src/ui-app` and the repoos.org landing
page; VitePress brings its own Vue-based theme.

## Local development

```bash
just docs-dev    # from repo root — dev server at http://localhost:5175
just docs-build  # from repo root — static build to .vitepress/dist
```

Or run it directly:

```bash
cd docs
bun install
bun run dev      # dev server at http://localhost:5173 (repoos-ui-dev already
                  # uses 5173 and repoos-mobile-dev uses 5174 — pass
                  # `-- --port 5175` to avoid colliding, which is what
                  # `just docs-dev` does for you)
bun run build    # static build to .vitepress/dist
bun run preview  # serve the built site
```

## Deploy (Cloudflare Pages)

Not set up as part of building the site — Cloudflare Pages project, DNS, and
custom domains are manual dashboard work. The convention, matching
repoos.org (#0338):

| Branch | Environment | Domain |
| --- | --- | --- |
| `main` | dev/staging | `docs-dev.repoos.org` |
| `prod` | production | `docs.repoos.org` |

`prod` advances only as an infrequent, deliberate fast-forward merge of `main`.

Cloudflare Pages settings (when a human wires this up):

- **Build command:** `bun install && bun run build` (working directory: `docs`)
- **Output directory:** `docs/.vitepress/dist`
- Clean URLs are enabled (`cleanUrls: true`); Cloudflare Pages serves
  `foo.html` at `/foo` natively, so no extra `_headers`/`_redirects` file is
  needed.

## How the site is organized

- **Content** — every existing `docs/*.md` is a page at its existing path
  (`/architecture`, `/concepts`, `/adr/0001-…`). Nothing was moved, so links
  from `AGENTS.md` and other in-repo docs still resolve. New pages: `index.md`
  (home) and `adr/index.md` (ADR overview).
- **Config** — `.vitepress/config.mts`: nav, sidebar, local search, dark-only
  identity (`appearance: 'force-dark'`). The sidebar (and the ADR overview
  table in `adr/index.md`) is **hand-curated, not auto-generated from the
  file tree** — VitePress doesn't do that out of the box. Adding a new doc or
  ADR means adding it to `themeConfig.sidebar` in `config.mts` yourself, or it
  won't appear in navigation even though the page still builds and is
  reachable by direct URL.
- **Theme** — `.vitepress/theme/custom.css` carries over the ui-app dark
  identity (palette, Sora + JetBrains Mono) onto the VitePress-default theme.
  Docs stay content-first; no marketing structure.
- **Excluded** — `docs/agents/**` (raw agent reports) is excluded from the
  build. Links reaching outside the site (`../src/…`, `../work/…`) are allowed
  to be dead via `ignoreDeadLinks`; they resolve on a repo checkout, not on
  the published site.