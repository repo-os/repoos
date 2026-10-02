---
id: "0625"
title: Show live DeepInfra and GitHub Copilot credit and usage data
type: feature
status: active
priority: p2
area: [agent, server]
assigned_to: ai
created_by: ""
branch: feat/show-live-deepinfra-and-github-copilot-c
created_at: "2026-10-02T08:51:36Z"
updated_at: "2026-10-02T09:35:03Z"
---
Replace dashboard link-outs for DeepInfra and GitHub Copilot on Agents > Model providers with supported live data where the account permits it. DeepInfra: evaluate documented authenticated /payment/checklist for credit balance and /payment/usage for spend, including balance sign and units. GitHub Copilot: evaluate the personal AI credit usage REST endpoint for personally billed plans, organization or enterprise endpoints for centrally billed plans, and documented quota interfaces where appropriate. Handle required scopes and account type clearly; do not equate billed usage with remaining entitlement. Reuse the existing key storage pattern, preserve safe errors and dashboard fallback, update UI copy and docs, and add parser, route, and component coverage. Sources: https://docs.deepinfra.com/api-reference/billing/get-checklist ; https://docs.deepinfra.com/api-reference/billing/usage ; https://docs.github.com/en/rest/billing/usage ; https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/usage-and-billing

## Problem
Agents → **Model providers** already shows live spend for OpenRouter and opencode Go (API key pasted once into `.env`, fetched server-side with timeouts and safe errors). **DeepInfra** and **GitHub Copilot** are still `kind: "link"` rows that only send people to external dashboards, even though both vendors expose authenticated billing/usage APIs for many accounts.

Operators want the same at-a-glance view inside RepoOS when their credentials and plan type support it, without losing the dashboard link or leaking secrets in logs/responses.

## Activity

- 2026-10-02T08:51:36Z · created · unknown
- 2026-10-02T08:59:37Z · status inbox→ready
- 2026-10-02T08:59:39Z · status ready→active, branch
- 2026-10-02T08:59:40Z · needs_input
- 2026-10-02T09:33:55Z · needs_input
- 2026-10-02T09:35:03Z · body: section ## Problem
