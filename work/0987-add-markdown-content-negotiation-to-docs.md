---
id: "0987"
title: Add Markdown content negotiation on docs.repoos.org
type: feature
status: done
priority: p2
area: [docs, infra]
merged_commit: 9a49c2c648b89a91d8b090a1f2764dadbd2d6cde
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-markdown-content-negotiation-on-docs
created_at: "2026-10-31T01:23:36Z"
updated_at: "2026-10-31T05:53:19Z"
last_close_out_gate_ms: 210838
last_close_out_gate_at: "2026-10-31T05:53:05.261Z"
---
## Problem

The published user-docs site at docs.repoos.org already ships each page as HTML (clean URLs) and as a raw Markdown twin at the same route with `.md` appended (for example `/getting-started.md` returns `200` with `text/markdown`). Agent fetch tools that send `Accept: text/markdown` on the HTML URL still receive `text/html`, so they must discover and rewrite URLs to the `.md` twin instead of using standard content negotiation.

Task #0984 deliberately skipped this because the site is a pure static asset bundle on Cloudflare (`user-docs/wrangler.jsonc` has no Worker today). This task implements negotiation without changing twin URLs, agent index files, or HTML page content.

## Desired UX

A client requests a normal docs page URL (for example `/getting-started`, `/getting-started/`, or `/`). If its `Accept` header prefers `text/markdown` over `text/html` (same or higher q-value for `text/markdown`), the response is the body of the existing `.md` twin for that page: `200`, `Content-Type: text/markdown; charset=utf-8`. If no twin exists for that path, the site falls back to today’s HTML response (no new 404). All other clients—including browsers with no `Accept`, `Accept: */*`, or typical `text/html,...` lists—keep getting HTML exactly as now.

HTML and Markdown responses for negotiated docs pages include `Vary: Accept` so shared caches (Cloudflare included) do not serve HTML to Markdown clients or the reverse. If the CDN does not honor `Vary: Accept` in practice, bypass cache for Markdown-negotiated responses or include `Accept` in the cache key; verify on production after deploy.

Direct requests to `.md` URLs, `llms.txt`, `llms-full.txt`, `sitemap.xml`, `robots.txt`, and existing `<link rel="alternate" type="text/markdown">` tags stay unchanged.

## Acceptance criteria

- [ ] `curl -sI -H 'Accept: text/markdown' https://docs.repoos.org/getting-started` returns `200`, `Content-Type: text/markdown; charset=utf-8`, and `Vary: Accept`.
- [ ] `curl -s -H 'Accept: text/markdown' https://docs.repoos.org/getting-started | head` shows Markdown source (not `<!DOCTYPE` or HTML shell).
- [ ] `curl -sI -H 'Accept: text/markdown' https://docs.repoos.org/` returns the index page’s Markdown twin (`200`, `text/markdown`, `Vary: Accept`).
- [ ] Trailing-slash variants (for example `/getting-started/`) negotiate the same way as the slashless URL when a twin exists.
- [ ] `curl -sI https://docs.repoos.org/getting-started` still returns `text/html` and includes `Vary: Accept`.
- [ ] `curl -sI -H 'Accept: text/html,application/xhtml+xml,*/*;q=0.8' https://docs.repoos.org/getting-started` returns `text/html` (unchanged browser behavior).
- [ ] Requests with no `Accept` header or `Accept: */*` still receive HTML only.
- [ ] When `text/markdown` and `text/html` q-values are equal, `text/markdown` wins (serve the twin).
- [ ] When no `.md` twin exists for the mapped path, the response is the normal HTML page (not 404).
- [ ] `curl -sI https://docs.repoos.org/getting-started.md` is unchanged: `200`, `text/markdown`, same body as before negotiation (no regression on twin URLs).
- [ ] `llms.txt`, `llms-full.txt`, sitemap, `robots.txt`, and per-page `rel="alternate"` markdown links are unchanged in URL, content, and behavior.
- [ ] Cloudflare caching behavior is checked on production (or documented with evidence): either `Vary: Accept` splits cache correctly, or Markdown-negotiated responses bypass cache / use an `Accept`-aware cache key.
- [ ] Handoff summary lists files changed, deploy notes if any, and pasted output of every verification command below (plus the same checks against a local built/preview artifact before deploy, noting if production differs until deploy).

Verification commands (production after deploy):

```bash
curl -sI -H 'Accept: text/markdown' https://docs.repoos.org/getting-started
curl -s  -H 'Accept: text/markdown' https://docs.repoos.org/getting-started | head
curl -sI -H 'Accept: text/markdown' https://docs.repoos.org/
curl -sI https://docs.repoos.org/getting-started
curl -sI -H 'Accept: text/html,application/xhtml+xml,*/*;q=0.8' https://docs.repoos.org/getting-started
curl -sI https://docs.repoos.org/getting-started.md
```

## Notes for AI

- **Where things live:** VitePress site in `user-docs/`; `.md` twins and `llms.txt` come from `vitepress-plugin-llms` in `user-docs/.vitepress/config.mts`. Deploy is Cloudflare Workers static assets via `user-docs/wrangler.jsonc` (today: assets only, no request handler). README runbook: `user-docs/README.md`.
- **Implementation:** Add request-time routing that parses `Accept`, maps the URL to the twin path (`/` → index twin, normalize trailing slashes), fetches or serves the static `.md` object when Markdown wins, otherwise passes through to HTML. Likely a Cloudflare Worker in front of the asset bundle (extend `wrangler.jsonc`) or VitePress dev middleware for local parity—not a second copy of Markdown content.
- **If negotiation cannot be done in-repo:** Do not guess Cloudflare dashboard clicks. Write exact zone/app settings (Transform Rules, Snippets, cache rules, etc.) the owner must apply, then stop without shipping a partial repo change.
- **Do not:** Change `.md` twin URL patterns, regenerate or edit `llms.txt` / `llms-full.txt` content for this feature, alter sitemap/robots behavior, remove or change existing `rel="alternate" type="text/markdown"` tags, or edit user-docs page prose.
- **Accept parsing:** Implement q-value comparison between `text/markdown` and `text/html` only for this feature; honor the explicit rule that missing `Accept`, `*/*`, and browser-style `text/html,...` lists must still yield HTML even if a naive RFC parser would choose otherwise.
- **Tests:** Extend or add checks under `user-docs/scripts/` if feasible (for example negotiation logic unit tests); keep `scripts/check-llms.ts` passing so twins and index files stay consistent.
- **Related outcome:** #0984 skipped negotiation with live proof that `Accept: text/markdown` on `/configuration` returned HTML—this task closes that gap.

## Scope

In scope: `Accept`-based serving of existing `.md` twins on HTML routes, `Vary: Accept` on affected HTML and Markdown responses, cache correctness on Cloudflare, and verification on docs.repoos.org (and dev/staging if useful before prod).

Out of scope: Changing twin URL scheme, docs copy, llms index format, homepage (repoos.org), and robots/sitemap content beyond headers needed for negotiation.

## Related

- #0984 — same negotiation item, previously optional and skipped after static-hosting assessment.
- `user-docs/README.md` — agent files (`llms.txt`, twins at `/<route>.md`), deploy via `wrangler deploy`.
- `work/0984-make-repoos-org-and-docs-repoos-org-easi.md` — handoff notes on why negotiation was deferred.

## Original prompt

Add Markdown content negotiation to docs.repoos.org. Today, a docs page requested with `Accept: text/markdown` returns text/html. Only the `.md` twin URL (e.g. /getting-started.md, which already returns 200 text/markdown) gives Markdown.

Goal: when a request's Accept header prefers text/markdown, serve that page's existing .md twin in place of the HTML. Everything else behaves exactly as now.

Requirements:
1. For any docs page URL (e.g. /getting-started, /getting-started/, and the root /), if the Accept header lists text/markdown with a higher or equal q-value than text/html, respond with the content of the matching .md twin:
- Status 200, `Content-Type: text/markdown; charset=utf-8`.
- Map `/` to the index page's .md twin, and handle trailing slashes.
- If no .md twin exists for that path, fall back to the normal HTML (don't 404).
2. Add `Vary: Accept` to BOTH the HTML and Markdown responses for docs pages, so Cloudflare and other caches don't serve one format to clients asking for the other. Check that the Cloudflare cache respects it. If it doesn't, bypass the cache for Markdown-negotiated requests or include Accept in the cache key.
3. Requests with no Accept header, `Accept: */*`, or browser-style `text/html,...` must still get HTML, unchanged.
4. Don't change the .md twin URLs, llms.txt, llms-full.txt, sitemap, robots.txt or the existing <link rel="alternate" type="text/markdown"> tags.
5. Implement this wherever docs routing lives (a framework middleware, a Cloudflare Worker, or a Pages _worker/Functions file). If it can only be done in the Cloudflare dashboard (e.g. a Transform/Snippet rule), don't guess: write out exactly what to configure and stop.

Verify and paste the output of each:
curl -sI -H 'Accept: text/markdown' https://docs.repoos.org/getting-started        # 200, text/markdown, Vary: Accept
curl -s  -H 'Accept: text/markdown' https://docs.repoos.org/getting-started | head  # Markdown, not <!DOCTYPE
curl -sI -H 'Accept: text/markdown' https://docs.repoos.org/                       # index as Markdown
curl -sI https://docs.repoos.org/getting-started                                   # still text/html, Vary: Accept
curl -sI -H 'Accept: text/html,application/xhtml+xml,*/*;q=0.8' https://docs.repoos.org/getting-started  # text/html
curl -sI https://docs.repoos.org/getting-started.md                                # unchanged, text/markdown

Report what you changed, where, and the verification output.

## Activity

- 2026-10-31T01:23:36Z · created · hello@repoos.org
- 2026-10-31T01:24:18Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added); Related (added)
- 2026-10-31T03:08:32Z · status inbox→ready
- 2026-10-31T03:08:36Z · status ready→active, branch
- 2026-10-31T03:09:15Z · note: adopted orphaned engineer pid 81210
- 2026-10-31T03:20:33Z · status active→review
- 2026-10-31T03:20:35Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (9a49c2c64) during finalization (#0734)
- 2026-10-31T03:21:18Z · note: review pass 1: good to go
- 2026-10-31T05:53:05Z · close-out gate completed in 211s
- 2026-10-31T05:53:19Z · status done→done, release:success
