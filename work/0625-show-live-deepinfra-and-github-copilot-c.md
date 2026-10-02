---
id: "0625"
title: Show live DeepInfra and GitHub Copilot credit and usage data
type: feature
status: inbox
priority: p2
area: [agent, server]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-02T08:51:36Z"
updated_at: "2026-10-02T08:51:36Z"
---
Replace dashboard link-outs for DeepInfra and GitHub Copilot on Agents > Model providers with supported live data where the account permits it. DeepInfra: evaluate documented authenticated /payment/checklist for credit balance and /payment/usage for spend, including balance sign and units. GitHub Copilot: evaluate the personal AI credit usage REST endpoint for personally billed plans, organization or enterprise endpoints for centrally billed plans, and documented quota interfaces where appropriate. Handle required scopes and account type clearly; do not equate billed usage with remaining entitlement. Reuse the existing key storage pattern, preserve safe errors and dashboard fallback, update UI copy and docs, and add parser, route, and component coverage. Sources: https://docs.deepinfra.com/api-reference/billing/get-checklist ; https://docs.deepinfra.com/api-reference/billing/usage ; https://docs.github.com/en/rest/billing/usage ; https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/usage-and-billing

## Activity

- 2026-10-02T08:51:36Z · created · unknown
