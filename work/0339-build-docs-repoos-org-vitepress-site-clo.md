---
id: "0339"
title: Build docs.repoos.org VitePress site (Cloudflare Pages)
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
pm_model_override: opencode-go/hy3
review_model_override: opencode-go/deepseek-v4-pro
created_at: "2026-09-13T04:13:36Z"
updated_at: "2026-09-13T07:09:41Z"
---
Build a VitePress documentation site for docs.repoos.org, deployed on Cloudflare Pages.

## What

A standalone docs site that republishes RepoOS's existing documentation (the
`docs/*.md` files in this repo) as a browsable VitePress site. Independent of
`src/ui-app` and of the landing page (#0338): its own directory, its own
build/deploy pipeline, no shared runtime. VitePress brings its own Vue-based
theme, so there is no need to match the landing page's stack choice.

## Deploy / branch convention

Follow the same convention as the landing page (#0338) and Celleris:

- `main` branch push → deploy to the dev/staging Cloudflare Pages environment.
- `prod` branch push → deploy to the production environment, advanced only as an
  infrequent, deliberate fast-forward merge of `main`.

## Content source

Source content from the existing `docs/` directory (or a curated
subset/reorganization of it) rather than starting from scratch — `docs/*.md`
already documents most of RepoOS's architecture and behavior.

## Repo layout

Its own `docs/package.json` (a standalone sibling project), not the root
`package.json` — same reasoning as #0338 and the `mobile/` precedent: no bun
workspaces needed.

## Scope

Build and verify locally only (dev server + browser preview). Do **not** set up
Cloudflare Pages, DNS, or custom domains as part of this task; that is manual
Cloudflare-dashboard work only a human can do, tracked outside the task system,
and does not block this task's definition of done.

## Style

Keep it VitePress-default and content-first — more so than the landing page.
It may share the same dark visual identity (dark theme, typography), but a docs
site should not read like it is selling something the way #0338's landing page
does: only the visual identity carries over, not the marketing-page structure.

## Dependencies

Depends on nothing to start, but is a prerequisite (along with #0338) for the
future "Deployments" page task on RepoOS's own board.

## Activity

- 2026-09-13T04:13:36Z · created · unknown
- 2026-09-13T06:24:01Z · note: Repo layout: give this its own package.json (docs/package.json), not root package.json. Same reasoning as the note on #0338 — follow the mobile/ precedent of a standalone sibling project, no bun workspaces needed.
- 2026-09-13T06:30:03Z · note: URL convention: docs.repoos.org (prod), docs-dev.repoos.org (dev).
- 2026-09-13T06:47:16Z · note: Scope narrowed: build and verify locally only (dev server + browser preview). Don't set up Cloudflare Pages/DNS/custom domains as part of this task — that's manual Cloudflare-dashboard work only a human can do, tracked outside the task system, and doesn't block this task's own definition of done.
- 2026-09-13T06:50:22Z · note: Keep this more VitePress-default and content-first than the landing page -- it can share the same dark visual identity, but a docs site shouldn't read like it's selling something the way #0338's landing page does. See the style note on #0338 for the landing page's direction; only the visual identity (dark theme, typography) should carry over here, not the marketing-page structure.
- 2026-09-13T07:08:02Z · pm_model_override
- 2026-09-13T07:09:02Z · review_model_override
- 2026-09-13T07:09:41Z · body
