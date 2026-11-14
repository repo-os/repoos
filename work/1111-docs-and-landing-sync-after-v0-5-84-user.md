---
id: "1111"
title: "Docs and landing sync after v0.5.84: user-docs, docs site, landing page and llms files"
type: feature
status: inbox
priority: p2
area: [docs, landing]
assigned_to: ai
created_by: t@t
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T09:08:28Z"
updated_at: "2026-11-14T09:08:32Z"
---
## Problem
Several user-facing changes landed after v0.5.83 (and in v0.5.84) and the public surfaces may not mention them or may contradict them: user-docs (the docs.repoos.org source), the docs site build, the repoos.org landing page (landing/), and the generated llms.txt / llms-full.txt files. No one has checked.

## Desired UX
A reader of docs.repoos.org, repoos.org or the llms files finds accurate, current statements of what RepoOS does, with the new features documented and no stale claims.

## Acceptance criteria
1. Verify each of these is documented in the right place in user-docs, with correct flags and behaviour matching the code: `repoos servers --tailscale` (#1105); the Keep review verdict button and `repoos review keep <id>` (#1103); the restart notice dialog, its Copy restart command button and the scrolling release notes in the update dialog (#1104); release resume behaviour after a pushed main, host-failure labelling and the version-literal test guard (#1106, docs/releases.md and user-docs/deployments-and-releases.md); and the Land anyway override on Move to done (#1081, user-docs/review-and-close-out.md). If #1108 (auto-recover idle tasks) or #1109 (`repoos restart` for hand-started servers) have landed on main by the time you start, include them; otherwise list them in the report as pending.
2. Fix any missing, wrong or stale statements found, scoped to these features; each fix cites the code it was checked against. Do not rewrite unrelated pages.
3. Landing page: read landing/src and landing/README.md; update feature copy or the changelog surface only where a landed change makes an existing statement wrong or where the page already lists a comparable feature. Do not invent claims, testimonials or marketing copy, and do not add new sections; list any suggested additions in the report for Nick instead.
4. Regenerate and verify the llms.txt / llms-full.txt outputs and the changelog page data (user-docs/changelog.data.ts, CHANGELOG.md is release-generated, do not hand-edit it) so they reflect the docs changes; the docs site and landing builds succeed.
5. Link and redirect tests (landing-agent-redirects etc.) still pass; `repoos check` passes.

## Notes for AI
Follow docs/agents-md-size.md: do not grow AGENTS.md. Put findings in the engineering report. Anything needing a product decision goes in the report, not the docs.

## Activity

- 2026-11-14T09:08:28Z · created · t@t
- 2026-11-14T09:08:32Z · cli_override, model_override
