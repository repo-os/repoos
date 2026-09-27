# repoos.org

The RepoOS marketing/landing site. A standalone static site — own
`package.json`, own lockfile, own build/deploy pipeline, no bun workspaces
(same pattern as `mobile/`). Independent of `src/ui-app` and of the docs site
(`docs/`, #0339); shares the Classic visual identity (palette, Sora +
JetBrains Mono) and optional Gruvbox design theme lifted from the app.

## Theme switcher

Visitors pick two independent axes from the nav:

| Axis | DOM | Storage key | Values |
| --- | --- | --- | --- |
| **Design theme** | `data-ui-theme` on `<html>` (omitted for Classic) | `repoos-ui-theme` | `classic`, `gruvbox` |
| **Appearance** | `data-theme` on `<html>` | `repoos-theme` (unchanged) | `dark`, `light` |

`index.html` runs a synchronous inline script before first paint to apply both
axes and to set `<meta name="theme-color">` for all four combinations. Gruvbox
tokens are copied from `src/ui-app/src/style.css` into `src/style.css` — the
landing does not import app code.

### Shareable URLs

Query parameters override stored choices on first load (then persist to
`localStorage` so a reload without the query keeps the same look):

| Param | Values | Example |
| --- | --- | --- |
| `theme` | `classic`, `gruvbox`, or any future design id (`catppuccin`, `ayu`, …) | `?theme=gruvbox` |
| `appearance` | `dark`, `light` | `?appearance=light` |
| `mode` | alias for `appearance` | `?theme=gruvbox&mode=light` |

Examples: `https://repoos.org/?theme=gruvbox`, `https://repoos.org/?theme=classic&appearance=dark`.

Resolution order per axis: **URL → `localStorage` → default** (Classic design;
appearance from OS `prefers-color-scheme` when nothing is stored). Using the nav switcher updates the URL with `history.replaceState` (no reload);
a plain visit without query params keeps a clean address bar until then. Parsing and validation live in `src/theme-resolve.ts`. The pre-paint boot
script is bundled from `src/theme-boot.ts` into `index.html` at dev/build time
(`vite-plugin-theme-boot.ts`) so there is a single source of truth.

## Repo layout

```
landing/
  src/            the site — Vue 3 + TypeScript + Tailwind
  public/         static assets copied as-is (favicon, og:image)
  dist/           build output (gitignored)
  index.html      entry point + meta tags (title, description, Open Graph/Twitter)
```

## Local development

```bash
just landing-dev    # from repo root — dev server at http://localhost:5176
just landing-build  # from repo root — static build to landing/dist
```

Or run it directly:

```bash
cd landing
bun install
bun run dev      # dev server at http://localhost:5173 by default
                  # (repoos-ui-dev already uses 5173, repoos-mobile-dev uses
                  # 5174, docs uses 5175 — pass `-- --port 5176` to avoid
                  # colliding, which is what `just landing-dev` does for you)
bun run build    # typecheck (vue-tsc) + static build to dist/
bun run preview  # serve the built site
```

## Deploy (Cloudflare)

Not set up as part of building the site — the Cloudflare project, DNS and
custom domains are manual dashboard work. The convention, matching the docs
site (#0339):

| Branch | Environment | Domain |
| --- | --- | --- |
| `main` | dev/staging | `landing-dev.repoos.org` |
| `prod` | production | `repoos.org` |

`prod` advances only as an infrequent, deliberate fast-forward merge of `main`.

Cloudflare's dashboard now creates git-connected static sites as **Workers**
(`wrangler deploy`), not the older "Pages project" flow — there's no
root-directory/output-directory pair to fill in; deployment is driven by
`wrangler.jsonc` in this directory instead. In the "Create an app" wizard:

- **Build command:** `bun install && bun run build`
- **Deploy command:** leave the default (`npx wrangler deploy`)
- **Path** (under Advanced settings): `landing` — this repo is a monorepo, so
  Cloudflare needs to know which subdirectory to build/deploy from
- **Builds for non-production branches:** on
- **Production branch:** `prod` (set wherever the wizard's repo-selection step
  asks for it)
- **API token:** let it auto-create one; no manual token or secret needed
- **Protect with Cloudflare Access:** off — it's a public marketing site

`wrangler.jsonc` here is a pure static-assets config (no Worker script) — see
that file's comments. Verify locally before deploying:
`cd landing && bunx wrangler deploy --dry-run`.

## Notes for future edits

- The board stats (task counts, version) in `src/App.vue` (and the `og:image`/
  `og:description` meta tags in `index.html`) are **hand-written snapshots**,
  not fetched live — there's no backend here to source them from. Copy is
  deliberately phrased as "as of vX.Y.Z" / "N+ tasks" rather than implying a
  live figure, so it doesn't need updating on every commit; still worth a
  glance whenever RepoOS cuts a meaningfully newer release.
- `og:image`/`twitter:image` are absolute URLs (`https://repoos.org/...`) —
  both platforms require an absolute URL to render a link preview image, a
  relative path silently fails.
