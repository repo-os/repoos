# repoos.org

The RepoOS marketing/landing site. A standalone static site — own
`package.json`, own lockfile, own build/deploy pipeline, no bun workspaces
(same pattern as `mobile/`). Independent of `src/ui-app` and of the docs site
(`docs/`, #0339); shares only the dark visual identity (palette, Sora +
JetBrains Mono).

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

## Deploy (Cloudflare Pages)

Not set up as part of building the site — Cloudflare Pages project, DNS, and
custom domains are manual dashboard work. The convention, matching the docs
site (#0339):

| Branch | Environment | Domain |
| --- | --- | --- |
| `main` | dev/staging | `landing-dev.repoos.org` |
| `prod` | production | `repoos.org` |

`prod` advances only as an infrequent, deliberate fast-forward merge of `main`.

Cloudflare Pages settings (when a human wires this up):

- **Build command:** `bun install && bun run build` (working directory: `landing`)
- **Output directory:** `landing/dist`

## Notes for future edits

- The stat bar and version number in `src/App.vue` (and the `og:image`/
  `og:description` meta tags in `index.html`) are **hand-written snapshots**,
  not fetched live — there's no backend here to source them from. Copy is
  deliberately phrased as "as of vX.Y.Z" / "N+ tasks" rather than implying a
  live figure, so it doesn't need updating on every commit; still worth a
  glance whenever RepoOS cuts a meaningfully newer release.
- `og:image`/`twitter:image` are absolute URLs (`https://repoos.org/...`) —
  both platforms require an absolute URL to render a link preview image, a
  relative path silently fails.
