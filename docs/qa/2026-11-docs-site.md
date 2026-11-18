# Docs site and in-app help QA — November 2026

## Scope

Checked the VitePress user documentation site, its local search, section deep links, and the docs destinations linked by the in-app help UI. The app was served from this task worktree with `just serve-noauth 7272`; the docs site ran locally on port 5174. All browser checks used headless Playwright.

## Results

- `bun run build` in `user-docs/` passed, including the VitePress static render, LLM index checks, and AI-agent guide checks. The initial attempt could not start because the worktree lacked VitePress dependencies; `bun install --frozen-lockfile` in `user-docs/` installed the locked packages, after which the build passed.
- Opened each of the 29 URLs in the generated sitemap in headless Chromium. Each returned successfully and rendered an H1. No page errors were reported.
- Opened the local search and searched for “authentication.” The local search showed multiple matching results, including the Authentication page.
- Opened `/getting-started#starting-a-new-project-as-an-agent`. The heading exists and the browser scrolled to that section, confirming the sidebar deep link works.
- Started the main app through the required auth-less task-worktree server. `/`, `/agents`, `/checks`, `/settings`, `/deployments`, and `/releases` returned HTTP 200; the shell rendered without browser page errors. The app source’s docs help destinations map to the built site routes `/agents`, `/check`, `/configuration`, `/troubleshooting`, and `/deployments-and-releases`; all were included in the successful sitemap page pass.

## Findings

No broken docs routes, missing page render, or failed search result was reproduced, so no product-code fix was indicated. Existing UI search tests cover title/path and document-content matching in `src/ui-app/tests/search.test.ts`.

The build emits one `vitepress-plugin-llms` warning: it cannot match the section-level sidebar URL `/getting-started#starting-a-new-project-as-an-agent` to a file while generating `llms.txt`. This is an index-generator lookup warning, not a broken web link: the route and section anchor both work in the browser. The warning is recorded for visibility; changing the navigation target would remove useful deep-link behavior.

The app shell routes were checked without signing in, but this pass did not exercise populated, authenticated app states or external network availability of the production docs domain. Local destination coverage was verified against the docs site built from this same worktree.
