---
id: "0133"
title: Document opencode model pricing and use cases for RepoOS agents
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/document-opencode-model-pricing-and-use-
created_at: "2026-08-12T10:42:58Z"
updated_at: "2026-08-12T11:06:02Z"
---
## Problem

RepoOS's agents page lets users pick a model for each agent role (engineer, reviewer, pm, etc.) from a dropdown of available opencode models. But there is no guidance in the UI about what each model costs, what its strengths are, or which role it suits best. Users pick blindly from names like "big pickle" or "deepseek v4" without knowing the trade-offs. This leads to suboptimal model choices — slow and expensive models for lightweight tasks, or weak models for critical review work.

## Desired UX

1. A new documentation page lives at `docs/opencode-models.md` that presents a clean, scannable table of models available through opencode. Each row covers: model name, approximate pricing (input/output per 1M tokens), best use cases, and which RepoOS agent roles it is recommended for.
2. The page is rendered through the existing "Repo Context" view (`/repo` in the UI), same as every other doc.
3. The Agents page (`AgentsView.vue`) gains a small, contextual link — something like "Model pricing & use cases" — placed near the model dropdowns. Clicking it opens the doc in a new browser tab (or navigates to `/repo` with the doc pre-selected).
4. The table is "pretty and easy to understand" — clear column headers, no walls of text, maybe a subtle color key or emoji indicators for budget/performance tiers.

## Acceptance criteria

- [ ] `docs/opencode-models.md` exists with frontmatter (title) and a well-formatted markdown table
- [ ] The table covers all models currently surfaced by `opencode models` (default plus any live-probed entries)
- [ ] Each model row includes: name, approximate input cost per 1M tokens, output cost per 1M tokens, a brief "best for" description, and recommended RepoOS agent roles
- [ ] The doc is visible in the "Repo Context" → Docs tab
- [ ] The Agents page includes a link to the doc, placed near the model dropdown area
- [ ] `repoos check` passes

## Notes for AI

- The opencode model list should be fetched live (run `opencode models`) at research time to get the actual current models. Do NOT hardcode a stale list from memory. Cross-reference pricing by fetching the opencode docs site or model provider pages.
- The doc goes in `docs/opencode-models.md`. Use the existing docs markdown rendering pipeline — no new React/MDX components needed. Keep the table pure markdown.
- For the agents page link: `AgentsView.vue` is at `src/ui-app/src/views/AgentsView.vue`. Add a link (anchor tag or router-link) near the model `Select` dropdowns. Opening in a new tab is acceptable and simpler than pre-selecting a doc in ContextView.
- This is documentation + a small UI link change. Do NOT change the model dropdown behavior, the agents store, or the API. Do NOT introduce new npm dependencies.
- Pricing found during research is current at the time of writing. Add a dated note at the bottom of the doc indicating when the research was done so readers can gauge staleness.
- The doc should have YAML frontmatter with `title:` so it renders properly in the Context view.

## Scope

In scope:
- One new doc file (`docs/opencode-models.md`)
- One small link addition in `AgentsView.vue`

Deferred:
- Auto-updating pricing from live APIs
- Per-task model cost estimates
- Model selection wizards or recommendations in the agent config UI

## Related

- 0064 (per-task agent and model overrides — this doc helps users choose overrides wisely)
- AGENTS.md (agents section references model choice)

## Activity

- 2026-08-12T10:42:58Z · created · unknown
- 2026-08-12T11:05:59Z · status inbox→ready
- 2026-08-12T11:06:02Z · status ready→active, branch
