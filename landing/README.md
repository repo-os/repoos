# repoos.org

The RepoOS marketing/landing site. A standalone marketing app with static pages and a small enquiry Worker — own
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

**Docs hand-off:** every link to `docs.repoos.org` in `src/App.vue` appends the
current `theme` / `appearance` query params (via `appendThemeToUrl` in
`theme-resolve.ts`), so a visitor on e.g.
`https://repoos.org/?appearance=dark&theme=gruvbox` lands in gruvbox/dark on the
docs site. The docs navbar link back to `repoos.org` does the same in the other
direction. Cross-origin storage does not share keys; the query string is the
hand-off.

Resolution order per axis: **URL → `localStorage` → default** (Classic design;
appearance from OS `prefers-color-scheme` when nothing is stored). Using the nav switcher updates the URL with `history.replaceState` (no reload);
a plain visit without query params keeps a clean address bar until then. Parsing and validation live in `src/theme-resolve.ts`. The pre-paint boot
script is bundled from `src/theme-boot.ts` into `index.html` at dev/build time
(`vite-plugin-theme-boot.ts`) so there is a single source of truth.

## Repo layout

```
landing/
  src/            the site — Vue 3 + TypeScript + Tailwind
  for-clients/    second HTML entry, with page-specific social metadata
  worker.ts       same-origin enquiry endpoint and asset fallback
  public/         static assets copied as-is (favicon, og:image)
  dist/           build output (gitignored)
  index.html      entry point + meta tags (title, description, Open Graph/Twitter)
```

## Agent files

`https://repoos.org/llms.txt` is generated, not committed. `vite-plugin-llms-txt.ts`
reads the one canonical starter prompt at `../agent/starter-prompt.md` and adds a
short llmstxt.org overview with the published install commands and links to the
docs site. `vite dev` serves the same text at `/llms.txt`; `vite build` emits
`dist/llms.txt` at the dist root so the Worker serves it. Edit the prompt file,
not a copy in a Vue component.

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

`wrangler.jsonc` serves the static assets and the dependency-free `worker.ts`.
`/api/*` always reaches the Worker; other assets retain static serving. Both
`/for-clients` and `/for-clients/` load the dedicated HTML entry, with absolute
asset paths and page-specific title, description and social metadata. Unknown
pages still 404 (this is not an unrestricted SPA fallback).

Verify locally before deploying: `cd landing && bunx wrangler deploy --dry-run`.
See the enquiry setup below before enabling the form in production.

## Notes for future edits

- The board stats (task counts, version) in `src/App.vue` (and the `og:image`/
  `og:description` meta tags in `index.html`) are **hand-written snapshots**,
  not fetched live — there's no stats backend here to source them from. Copy is
  deliberately phrased as "as of vX.Y.Z" / "N+ tasks" rather than implying a
  live figure, so it doesn't need updating on every commit; still worth a
  glance whenever RepoOS cuts a meaningfully newer release.
- `og:image`/`twitter:image` are absolute URLs (`https://repoos.org/...`) —
  both platforms require an absolute URL to render a link preview image, a
  relative path silently fails.


## For Clients and enquiries (#0849)

`src/components/ForClients.vue` reproduces the approved page concept. It uses
`src/clients.css` with the landing app's existing theme tokens. The nav, theme
controls, docs theme handoff and footer are shared through `App.vue`. Six nav
links use the existing mobile menu below 1024px. The content uses we/us/our;
the illustrative board is labelled. Real project showcases are deliberately
not included until approved content arrives (held task #0848).

`EnquiryForm.vue` collects name/company, **work email**, a project brief and
one of three timing options. Work email is a required email field, not a
free-email-provider blocklist. The form explains that the details go to
hello@repoos.org via Resend to respond to the enquiry; it does not subscribe
anyone to a mailing list. Drafts stay in component memory only, not storage,
URLs or analytics. Closing/reopening the dialog preserves a draft. A disabled
fieldset and submit guard prevent duplicate clicks. Retries of an unchanged
draft reuse the same submission ID; success is shown only after the endpoint
confirms Resend accepted the message (not a guarantee of inbox delivery).

### Server and secrets

`POST /api/enquiry` runs on the **landing Cloudflare Worker**, never the local
RepoOS control plane. It uses native `fetch` to call the existing Resend email
provider, with no SDK/runtime dependency. The recipient is hard-coded to
`hello@repoos.org`; the visitor's validated email becomes `reply_to`, never
`from` or `to`. Emails are plain text with a fixed subject. Credentials are
never bundled into Vite assets or written to tracked files.

Before launch, configure the landing Worker in Cloudflare (the local RepoOS
server's `.env` does **not** automatically configure hosted Workers):

- Set the existing `REPOOS_RESEND_API_KEY` as a **Worker secret** using the
  dashboard or `bunx wrangler secret put REPOOS_RESEND_API_KEY` from `landing/`.
  Use the secure prompt; never pass or paste its value into source, tasks,
  command arguments, chat, TOML, or a `VITE_*` variable.
- Set `ENQUIRY_FROM` as a second Worker secret (also preserved across deploys)
  using `bunx wrangler secret put ENQUIRY_FROM`, with a sender on an
  **already verified Resend domain**, e.g. a display name and that verified
  email address. Do not use the visitor's address. The application deliberately
  does not guess the project's verified sender.
- Keep both `ENQUIRY_RATE_LIMITER` and `ENQUIRY_GLOBAL_LIMITER` bindings in
  `wrangler.jsonc`. Namespace IDs `84901`/`84902` are reserved for this endpoint;
  confirm they are unused by other account services before first deployment.
  Limits are 5 attempts/source/minute and 30 valid send attempts/site/minute,
  per Cloudflare location. These edge limits are best-effort abuse controls,
  not a strict worldwide spend cap. Shared networks share the source limit.
- Test a controlled enquiry after deployment, confirm receipt at
  hello@repoos.org, and verify Reply goes to the entered work email. Provider
  acceptance alone does not prove deliverability. No live email is sent by
  the automated tests.

Missing secrets/sender/limiters fail closed with 503; there is no fake success
or browser-side mail fallback. Cross-origin/non-JSON requests, invalid input,
header injection, unsupported timing, and bodies above 24 KB are refused.
Both declared length and streamed bytes are bounded. A honeypot discards bot
submissions. Source IPs are hashed before rate-limit use; neither project
content nor provider error details are logged or returned. Provider calls have
a ten-second timeout and content-bound Resend idempotency keys (Resend retains
them for 24 hours). Visitor errors retain the draft and offer
hello@repoos.org as a fallback.

### Local checks

`bun run dev` previews the marketing pages and dialog only; it does not read
or send real email, and its `/api/enquiry` is not wired to a live provider.
To exercise the Worker locally, build first, then use `bunx wrangler dev`
with a gitignored `landing/.dev.vars` holding the two server variables. Do
not use real email delivery for routine UI verification. The focused tests
mock Resend and limiter bindings:

```bash
# From the repo root:
bun run --bun test:vitest src/ui-app/tests/landing-clients.test.ts src/ui-app/tests/landing-enquiry.test.ts
# From landing/:
bun run build
```

For review evidence, declare the client route and dialog with
`repoos update <id> --shots` and capture with `repoos shot --task <id>
--target "Landing page"`; `--viewport 390x844` captures the mobile layout.
Screenshots stay in RepoOS's gitignored attachment store.

References: [Resend send email](https://resend.com/docs/api-reference/emails/send-email),
[Worker asset routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/),
[Cloudflare rate limit bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
