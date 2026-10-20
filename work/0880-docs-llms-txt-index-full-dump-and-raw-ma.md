---
id: "0880"
title: "Docs llms.txt index, full dump, and raw Markdown"
type: feature
status: active
paths: [user-docs]
priority: p2
area: docs
story: Agent-discoverable RepoOS
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/docs-llms-txt-index-full-dump-and-raw-ma
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T16:01:19Z"
updated_at: "2026-10-20T20:10:38Z"
---
## Problem

`https://docs.repoos.org` is a VitePress 1.6 site (`user-docs/`, `vitepress` ^1.6.4, `cleanUrls: true`, output `user-docs/.vitepress/dist`, Cloudflare Pages) but it does not publish an agent index. An agent that follows the landing `llms.txt` to the docs origin cannot fetch a generated `llms.txt`, a consolidated `llms-full.txt`, or the pages as raw Markdown. Hand-copying the manual into a second tree would drift from `user-docs/*.md`.

## Desired UX

After `cd user-docs && bun run build`, the dist root contains `/llms.txt` (an index of the public manual) and `/llms-full.txt` (the same pages concatenated for an agent that asks for the full manual). Pages that are useful on their own are also fetchable as raw Markdown at the docs origin. Existing HTML routes (`/`, `/getting-started`, `/cli`, and the rest of the sidebar) still resolve. `user-docs/README.md` stays the build runbook and is not a docs page. This repo's `docs/` directory is not part of the index.

## Acceptance criteria

- Try `vitepress-plugin-llms` against `user-docs/.vitepress/config.mts` (VitePress 1.6.4, `cleanUrls: true`, and the existing `themeBootPlugin()` in `vite.plugins`). Keep the plugin when it emits both files into `.vitepress/dist` without breaking theme boot, clean URLs, or the Cloudflare output path. Otherwise implement a small `buildEnd` (or equivalent) step over the same `user-docs/*.md` sources. Do not maintain a second copy of the manual.
- `user-docs/.vitepress/dist/llms.txt` and `llms-full.txt` exist after `bun run build`. The index describes how to fetch a single page as raw Markdown. Those raw URLs stay on the docs origin and do not shadow an HTML route (`/getting-started` must still be the HTML page).
- `srcExclude` already drops `README.md`. The generator also excludes `README.md` and never reads this repo's `docs/`.
- A test or build assertion fails when a newly added `user-docs/*.md` page is omitted from the index, aside from `README.md` and any page the config explicitly skips (record the skip).
- `agents.txt` is left out unless a concrete client reads it and the same generator can emit it. Record that decision with `repoos update <id> --section Decision` (no full `--body` replace).

## Notes for AI

Story: Agent-discoverable RepoOS, slice 2. Area `docs`. No dependency on the landing prompt task; the two can land in either order.

Config and theme boot: `user-docs/.vitepress/config.mts`, `user-docs/.vitepress/vite-plugin-theme-boot.ts`, `user-docs/.vitepress/theme/index.ts`. Package: `user-docs/package.json`. Sidebar is hand-curated; this task does not add the agent guide page (that is a later task). `repoos check` already runs `user-docs-build` when `user-docs/**` changes — extend that build, do not add a separate checker.

The landing `llms.txt` is a short overview, not this index. Do not copy `user-docs/` into `landing/`. Internal `docs/` is build context for RepoOS itself (`user-docs/.vitepress/config.mts` states this at the top).

Out of scope: the portable skill, `user-docs/ai-agents.md`, the copy-prompt button, and paid inference.

## Activity

- 2026-10-20T16:01:19Z · created · njachowski@gmail.com
- 2026-10-20T20:10:29Z · status inbox→ready
- 2026-10-20T20:10:36Z · cli_override, model_override
- 2026-10-20T20:10:38Z · status ready→active, branch
