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
review_model_override: openrouter/deepseek/deepseek-v4-pro-0813
created_at: "2026-09-13T04:13:05Z"
updated_at: "2026-09-13T07:05:09Z"
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
- 2026-09-13T06:30:02Z · note: URL convention: repoos.org (prod), landing-dev.repoos.org (dev) — see note on #0340 for why dev.repoos.org is off-limits (already the tunnel hostname for RepoOS's own live dev instance).
- 2026-09-13T06:47:15Z · note: Scope narrowed: build and verify locally only (dev server + browser preview). Don't set up Cloudflare Pages/DNS/custom domains as part of this task — that's manual Cloudflare-dashboard work only a human can do, tracked outside the task system, and doesn't block this task's own definition of done.
- 2026-09-13T06:50:21Z · note: Style direction (from reviewing fizzy.do, herdr.dev, paperclip.ing, posthog.com
for patterns, not to copy their designs/copy):

- Show the real product in the hero, not stock imagery or generic illustration.
  RepoOS already has both a real Work board (kanban) and a real terminal
  workflow (`repoos new`, `repoos check`) -- screenshot one of those rather
  than mocking something up.
- One literal, specific headline sentence -- say the actual idea ("the repo
  is the operating system," tasks as markdown files an AI agent works in a
  git worktree), not generic "AI-powered dev tool" language.
- Put the real install command in the hero itself with a copy button --
  for a CLI tool that command is the primary CTA, more than a sign-up button.
  Use the actual curl install from this repo, not a placeholder.
- A real stat bar if there's an honest number available (this repo's own
  task count via `repoos status`, or GitHub stars) beats logos/testimonials
  for credibility -- and RepoOS dogfooding itself is a genuinely distinctive
  claim most competitors can't make.
- Dark-first visual style fits developer tooling (matches ui-app's existing
  dark aesthetic in style.css).
- Tone: match AGENTS.md's own voice -- direct, technical, dry-humored in
  places -- not smoothed-over SaaS copy.

Do not copy any of the four reference sites' actual designs, layouts, or
copy verbatim -- these are patterns to apply in RepoOS's own voice, not a
template to clone.
- 2026-09-13T07:05:09Z · review_model_override
