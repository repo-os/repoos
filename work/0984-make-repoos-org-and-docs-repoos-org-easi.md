---
id: "0984"
title: Make repoos.org and docs.repoos.org readable without JavaScript
type: feature
status: active
priority: p2
area: [landing, docs, infra]
assigned_to: ai
created_by: hello@repoos.org
branch: feat/make-repoos-org-and-docs-repoos-org-read
pm_model_override: grok-4.7-medium
created_at: "2026-10-30T05:37:53Z"
updated_at: "2026-10-30T06:22:39Z"
review_rounds: 1
routing_switches: 1
review_passes: 1
---
## Problem

Nothing on repoos.org or docs.repoos.org is blocked, but three gaps make the sites hard for AI agents and fetch tools to read.

1. The homepage (repoos.org) is rendered client-side. The raw HTML has a `<title>` and some code, but no readable body text, no `<meta name="description">`, and no link to `/llms.txt`. Most agent fetch tools do not run JavaScript, so the page looks nearly empty to them.

2. Content negotiation on the docs site does not prefer Markdown. A request with `Accept: text/markdown` to a docs page still returns HTML. Only the `.md` URL returns Markdown. This is optional and lower priority.

3. `robots.txt` on both sites contains only Cloudflare's explanatory comments. There are no directives and no `Content-Signal` line, so AI use is neither allowed nor forbidden.

## Desired UX

An agent that fetches the sites without running JavaScript can read what RepoOS is, how to install it, and where the docs and `llms.txt` live, and both sites explicitly allow search and AI input.

- The homepage's initial HTML includes the main copy: what RepoOS is, the install command, and the key links. That copy is present before any client-side render.
- The homepage has a meta description and an Open Graph description.
- The homepage has `<link rel="alternate" type="text/markdown" href="/llms.txt">`, or the equivalent link the docs pages already use, plus a visible link to `llms.txt` and to the docs.
- When the hosting setup allows it without real complexity, a docs page request whose `Accept` header prefers `text/markdown` is served the existing `.md` twin, with `Vary: Accept`. HTML stays the response when Markdown is not preferred.
- Both `robots.txt` files state explicit rules, for example:

```
User-agent: *
Content-Signal: search=yes, ai-input=yes
Allow: /
Sitemap: <sitemap URL if one exists>
```

Include a `Sitemap:` line only when a sitemap already exists. Leave `ai-train` unset.

## Acceptance criteria

- [ ] `curl -s https://repoos.org | sed 's/<[^>]*>//g'` shows the real homepage copy (what RepoOS is, the install command, and the key links), not an empty shell.
- [ ] The homepage's initial HTML includes a `<meta name="description">` and an Open Graph description.
- [ ] The homepage's initial HTML includes a `rel="alternate"` markdown link to `/llms.txt` (or the equivalent the docs pages already use), and the page shows a visible link to `llms.txt` and to the docs.
- [ ] Existing `.md` twins, `llms.txt`, `llms-full.txt`, and current `rel="alternate"` links are still present. Docs content and URLs are unchanged.
- [ ] `curl -s https://repoos.org/robots.txt` and `curl -s https://docs.repoos.org/robots.txt` show `User-agent: *`, `Content-Signal: search=yes, ai-input=yes`, and `Allow: /`. A `Sitemap:` line is present only if a sitemap already exists. `ai-train` is not set.
- [ ] The handoff summary flags that `ai-train` was left unset for the owner to decide.
- [ ] Optional: `curl -sH 'Accept: text/markdown' https://docs.repoos.org/<any-page>` returns Markdown, and the response includes `Vary: Accept`. If this needs real complexity, skip it and say why in the summary instead of shipping a partial negotiation setup.
- [ ] The summary reports what changed, where, and the output of each verification command. For any fix that lives in the Cloudflare dashboard rather than the repo, it names the exact setting to change.

## Notes for AI

- Do not change docs content or URLs. Do not remove the existing `.md` twins, `llms.txt`, `llms-full.txt`, or the `rel="alternate"` links.
- Do not set `Content-Signal` `ai-train`. Call out that omission in the summary so the owner can decide.
- Add `Sitemap:` only when a sitemap URL already exists. Do not create a sitemap for this task.
- Homepage description copy should match the site's existing description of RepoOS. Do not invent a new pitch.
- The visible homepage link should point at `llms.txt` and at the docs. Placement can follow the homepage's existing link pattern.
- Treat the live `curl` commands as the acceptance check. Also show the same checks against the built artifact before deploy, and say so if production will not match until the landing and docs deploys.
- Likely repo surfaces: `landing/` (homepage HTML and the Cloudflare Worker in `landing/worker.ts`) and `user-docs/` (VitePress build, `llms.txt` / `llms-full.txt`, and the per-page `.md` twins). `landing/index.html` already has a meta description and Open Graph description in source, and `landing/vite-plugin-llms-txt.ts` injects a markdown alternate link and a static `<main>` at transform time. Production is the source of truth: if live HTML is still an empty shell, find why the served page is not that built HTML (build, worker, or cache) instead of adding a second copy of the same tags.
- `robots.txt` is not in the repo today; live responses are Cloudflare's comment-only file. If a static `robots.txt` in the landing or docs build is what gets served, add it there. If Cloudflare's managed robots.txt replaces the origin file, do not guess a dashboard click-path — write the exact setting, zone, and value the owner must change, for both repoos.org and docs.repoos.org.
- Content negotiation belongs in whatever already serves docs (framework middleware or a Cloudflare rule/worker), and only when that is a small change. Skipping it is a valid outcome. Do not add a new hosting layer for it.
- Docs pages already publish a Markdown twin at the HTML path plus `.md`. Negotiation should serve that twin when `Accept` prefers `text/markdown`. It should not replace the `.md` URLs or change the HTML URLs.

## Scope

In scope: homepage initial HTML (body copy, meta description, Open Graph description, markdown alternate link, visible `llms.txt` / docs link), explicit `robots.txt` rules on both sites, and the optional docs `Accept: text/markdown` negotiation.

Out of scope: editing docs prose or routes, removing or regenerating the agent files beyond what is required to keep them served, choosing `ai-train`, and creating a sitemap that does not already exist.

## Related

- `user-docs/README.md` — agent files (`llms.txt`, `llms-full.txt`, raw Markdown twins).
- `landing/vite-plugin-llms-txt.ts` and `landing/worker.ts` — homepage `llms.txt` emission and how repoos.org serves those paths.

## Original prompt

Make repoos.org and docs.repoos.org easier for AI agents and fetch tools to read. Nothing is blocked today. These are three gaps:

1. Homepage (repoos.org) is rendered client-side. The raw HTML has a <title> and some code but no readable body text, no <meta name="description">, and no link to /llms.txt. Most agent fetch tools don't run JavaScript, so to them the page looks nearly empty.
- Pre-render or server-render the homepage so the main copy (what RepoOS is, install command, key links) is in the initial HTML.
- Add a meta description and Open Graph description.
- Add <link rel="alternate" type="text/markdown" href="/llms.txt"> (or the equivalent the docs pages already use) and a visible link to llms.txt / docs.
- Verify: `curl -s https://repoos.org | sed 's/<[^>]*>//g'` shows the real copy.

2. (Optional, lower priority) Content negotiation on docs. Requests with `Accept: text/markdown` to a docs page still return HTML; only the .md URL returns Markdown. If the hosting setup allows it (e.g. a Cloudflare rule/worker or framework middleware), serve the .md twin when Accept prefers text/markdown, and add `Vary: Accept`. Skip if it adds real complexity.
- Verify: `curl -sH 'Accept: text/markdown' https://docs.repoos.org/<any-page>` returns Markdown.

3. robots.txt on both sites contains only Cloudflare's explanatory comments, with no directives and no Content-Signal line, so AI use is neither allowed nor forbidden. Add explicit rules, e.g.:
User-agent: *
Content-Signal: search=yes, ai-input=yes
Allow: /
Sitemap: <sitemap URL if one exists>
Leave ai-train unset unless the owner decides; flag that choice in your summary.
- Verify: `curl -s https://repoos.org/robots.txt` and the docs one show the new lines.

Constraints: don't change docs content or URLs, and don't remove the existing .md twins, llms.txt, llms-full.txt or the rel=alternate links. If any fix lives in Cloudflare dashboard settings rather than the repo, say exactly what to change instead of guessing. Report back what you changed, where, and the output of each verification command.

## Round 2 handoff verification
## Changes and artifact checks

Added static robots.txt files at landing/public/robots.txt and user-docs/public/robots.txt. Built artifact checks passed: landing/dist/robots.txt and user-docs/.vitepress/dist/robots.txt each contain User-agent: *, Content-Signal: search=yes, ai-input=yes, and Allow: /. Neither includes Sitemap (none exists) or ai-train. The docs build still emits llms.txt, llms-full.txt, and raw Markdown twins, including configuration.md.

The landing build and current live https://repoos.org/ both contain the existing homepage fallback copy, install command, docs and llms.txt links, meta description, Open Graph description, and rel=alternate Markdown link. No homepage source change was needed.

Production robots verification is pending deployment: curl -fsSL https://repoos.org/robots.txt and curl -fsSL https://docs.repoos.org/robots.txt currently return Cloudflare’s comment-only policy text and no User-agent, Content-Signal, or Allow directives. The branch artifact files are correct; recheck the live URLs after both static sites deploy.

Cloudflare zone setting to check for repoos.org and docs.repoos.org: Dashboard > Security > Settings > Bot traffic > Configure AI bot policies. Set Search=Allow and Agent=Allow, keep Training=Allow so ai-train remains unset, and leave Enable Bot Preference Sync off if the current policy still overrides the origin robots.txt. Cloudflare documentation says Bot Preference Sync prepends managed directives only when enabled and at least one policy blocks; with all policies Allow it serves origin robots.txt unchanged.

Optional docs negotiation was skipped because docs are static Cloudflare assets and supporting Accept-based routing requires adding request handling. Verified with curl -sSI -H Accept: text/markdown https://docs.repoos.org/configuration: HTTP/2 200, content-type: text/html, no Vary: Accept. Existing .md URL remains available as a raw Markdown artifact.

ai-train was deliberately left unset in both repository robots files for the owner to decide.

## Activity

- 2026-10-30T05:37:53Z · created · hello@repoos.org
- 2026-10-30T05:40:20Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added); Related (added)
- 2026-10-30T05:42:54Z · status inbox→ready
- 2026-10-30T05:43:08Z · status ready→active, branch
- 2026-10-30T06:19:15Z · status active→review
- 2026-10-30T06:19:16Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (cad328067) during finalization (#0734)
- 2026-10-30T06:21:15Z · note: review pass 1: needs some work
- 2026-10-30T06:21:24Z · status review→active
- 2026-10-30T06:22:39Z · body: Round 2 handoff verification (added); Changes and artifact checks (added)
- 2026-10-30T06:22:39Z · message_queued at 2026-10-30T06:22:39.535Z
