---
id: "0412"
title: Add integrated coding agents to Model Providers
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-integrated-coding-agents-to-model-pr
review_model_override: opencode-go/hy3
created_at: "2026-09-18T12:54:04Z"
updated_at: "2026-09-18T13:10:42Z"
dev_error_count: 1
---
## Problem

The Model Providers view does not cover all coding agents that RepoOS currently integrates with. This makes the page incomplete for users who want one place to see which agent-backed services are available or relevant to their setup.

The immediate gap called out is support for coding agents such as Claude Code and GitHub Copilot. If RepoOS cannot surface useful usage, subscription, credit, or billing numbers for a provider, the page should still give users a clear link to that provider’s own dashboard.

## Desired UX

The Model Providers page should include every coding agent that RepoOS currently integrates with, where possible.

For each added provider, users should see either useful provider-specific account/usage information when RepoOS can reasonably obtain it, or a dashboard link when RepoOS cannot pull meaningful numbers. The fallback should still feel intentional, not like missing data.

## Acceptance criteria

- [ ] Audit the currently integrated coding agents and identify which ones are missing from Model Providers.
- [ ] Add entries for missing integrated coding agents, including at least Claude Code and GitHub Copilot if they are integrated in the repo.
- [ ] For each added provider, surface any available useful account, credits, subscription, or usage information that RepoOS can already access or can access without adding unsupported assumptions.
- [ ] For providers where useful numbers are unavailable, show a link to the provider’s relevant dashboard instead.
- [ ] The Model Providers UI clearly distinguishes available usage/subscription data from dashboard-only providers.
- [ ] Existing providers continue to render and behave as before.
- [ ] Any provider metadata or links added are kept in the same local pattern used by the current Model Providers implementation.
- [ ] `repoos check` passes.

## Notes for AI

Assume this is primarily a web/UI task unless the provider list is generated from shared core metadata.

Start by finding the existing Model Providers implementation and the source of truth for integrated coding agents. Prefer reusing existing provider metadata structures over adding a separate hardcoded list.

Do not invent usage, credit, subscription, or billing numbers. Only display numbers if the repo already has a reliable integration path for them. Otherwise, add the provider dashboard link as the fallback.

Use official provider dashboard URLs where links are needed.

## Original prompt

In "Model Providers" we don't cover all of the coding agents yet, please add all the coding agents currently integrated if possible (e.g. claude code, github copilot). at the very least link out to their respective dashboards if we can't pull in any useful numbers related to credits/subscription/usage here.

## Activity

- 2026-09-18T12:54:04Z · created · hello@repoos.org
- 2026-09-18T12:54:23Z · status draft→inbox, title, area, body
- 2026-09-18T12:57:29Z · review_model_override
- 2026-09-18T12:57:30Z · status inbox→ready
- 2026-09-18T12:57:32Z · status ready→active, branch
- 2026-09-18T12:58:57Z · agent exited with an error (copilot) · the agent process exited with an error — open the task to see the full output
- 2026-09-18T13:10:42Z · needs_input
