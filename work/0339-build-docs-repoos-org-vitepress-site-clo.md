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
created_at: "2026-09-13T04:13:36Z"
updated_at: "2026-09-13T06:30:03Z"
---
Stand up a VitePress-based documentation site at docs.repoos.org, deployed on
Cloudflare Pages, following the same branch convention as the landing page
task (#0338) and Celleris:

- `main` branch push -> deploy to the dev/staging Cloudflare Pages environment.
- `prod` branch push -> deploy to the production Cloudflare Pages environment,
  advanced only as an infrequent, deliberate fast-forward merge of `main`.

Source the content from the existing docs/ directory in this repo (or a
curated subset/reorganization of it) rather than starting from scratch --
docs/*.md already documents most of RepoOS's architecture and behavior.

Independent build/deploy pipeline from src/ui-app and from the landing page
(#0338); VitePress brings its own Vue-based theme, no need to match the
landing page's stack choice.

Depends on nothing to start, but is a prerequisite (along with #0338) for the
future "Deployments" page task on RepoOS's own board.

## Activity

- 2026-09-13T04:13:36Z · created · unknown
- 2026-09-13T06:24:01Z · note: Repo layout: give this its own package.json (docs/package.json), not root package.json. Same reasoning as the note on #0338 — follow the mobile/ precedent of a standalone sibling project, no bun workspaces needed.
- 2026-09-13T06:30:03Z · note: URL convention: docs.repoos.org (prod), docs-dev.repoos.org (dev).
