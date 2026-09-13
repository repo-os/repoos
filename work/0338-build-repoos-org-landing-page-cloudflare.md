---
id: "0338"
title: Build repoos.org landing page (Cloudflare Pages)
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-13T04:13:05Z"
updated_at: "2026-09-13T06:24:00Z"
---
Stand up a new static marketing site for repoos.org, deployed on Cloudflare
Pages, following the branch convention agreed for RepoOS/Celleris:

- `main` branch push -> deploy to the dev/staging Cloudflare Pages environment.
- `prod` branch push -> deploy to the production Cloudflare Pages environment.
  `prod` only ever advances as an infrequent fast-forward merge of `main`,
  done deliberately (not per-task, not automatic).
- Wire this up in Cloudflare Pages' branch-deploy config (or GitLab/GitHub CI,
  whichever fronts the Pages deploy) to match.

Stack recommendation (confirm before building, easy to override): Vue 3 +
Vite + Tailwind CSS, matching the toolchain already used in
src/ui-app so agents working across both codebases share context. Skip
shadcn/ui — it's a React-first, app-component library (dialogs, data tables,
forms) aimed at interactive app UIs, not a good fit for a mostly-custom,
content/SEO-driven marketing page. Plain Tailwind utility classes are enough
and are easier for an AI agent to iterate on quickly.

This site is independent of the src/ui-app Vue app — its own directory,
its own build/deploy pipeline, no shared runtime.

Depends on nothing to start, but is a prerequisite (along with the docs site
task) for the future "Deployments" page task on RepoOS's own board.

## Activity

- 2026-09-13T04:13:05Z · created · unknown
- 2026-09-13T06:24:00Z · note: Repo layout: give this its own package.json (landing/package.json), not root package.json. Follow the existing mobile/ precedent — a fully standalone sibling project with its own install/lockfile, decoupled from repoos's own package.json and check gate. No bun workspaces needed; ui-app shares root package.json only because its output ships inside dist/, which doesn't apply here.
