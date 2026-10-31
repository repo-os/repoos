---
id: "0987"
title: Add Markdown content negotiation to docs.repoos.org. Toda…
type: feature
status: draft
priority: p2
area: general
assigned_to: ""
created_by: hello@repoos.org
branch: ""
created_at: "2026-10-31T01:23:36Z"
updated_at: "2026-10-31T01:23:36Z"
---
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
