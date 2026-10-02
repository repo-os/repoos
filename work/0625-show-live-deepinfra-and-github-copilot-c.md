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
updated_at: "2026-10-02T10:33:17Z"
review_rounds: 1
review_passes: 1
---
Replace dashboard link-outs for DeepInfra and GitHub Copilot on Agents > Model providers with supported live data where the account permits it. DeepInfra: evaluate documented authenticated /payment/checklist for credit balance and /payment/usage for spend, including balance sign and units. GitHub Copilot: evaluate the personal AI credit usage REST endpoint for personally billed plans, organization or enterprise endpoints for centrally billed plans, and documented quota interfaces where appropriate. Handle required scopes and account type clearly; do not equate billed usage with remaining entitlement. Reuse the existing key storage pattern, preserve safe errors and dashboard fallback, update UI copy and docs, and add parser, route, and component coverage. Sources: https://docs.deepinfra.com/api-reference/billing/get-checklist ; https://docs.deepinfra.com/api-reference/billing/usage ; https://docs.github.com/en/rest/billing/usage ; https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/usage-and-billing

## Problem
Agents → **Model providers** already shows live spend for OpenRouter and opencode Go (API key pasted once into `.env`, fetched server-side with timeouts and safe errors). **DeepInfra** and **GitHub Copilot** are still `kind: "link"` rows that only send people to external dashboards, even though both vendors expose authenticated billing/usage APIs for many accounts.

Operators want the same at-a-glance view inside RepoOS when their credentials and plan type support it, without losing the dashboard link or leaking secrets in logs/responses.

## Desired UX
On **Agents → Model providers** (`/agents?tab=model-providers`):

**DeepInfra** becomes a **live** row when the user saves a DeepInfra API token (same bearer pattern as inference). The row shows, when the API returns them:

- **Ready-to-spend balance** derived from `GET https://api.deepinfra.com/payment/checklist` — treat `stripe_balance` per DeepInfra docs: **negative = funds available**, **positive = amount owed**; convert to a human “available credit” line (USD) and label it clearly so the sign is not misread.
- **Recent spend** from checklist `recent` (usage since the most recent invoice) with plain-language labeling.
- Optional secondary lines when present and useful: scoped promo credits (`scoped_credits` remaining), account suspended/overdue warnings — never crash the row if optional fields are absent.

Also fetch **`GET https://api.deepinfra.com/payment/usage`** (authenticated) for a sensible usage summary (e.g. current-period spend totals / breakdown the parser can rely on). If one endpoint succeeds and the other fails, show partial data plus a per-endpoint error string (mirror OpenRouter’s split-endpoint behavior).

**GitHub Copilot** becomes a **live** row when the user saves a GitHub token with the scopes required for the detected billing mode:

- **Personal / individually billed:** use the documented **personal** Copilot AI credit / usage REST surface (see GitHub REST billing usage docs linked in the task). Show what the API actually exposes (e.g. consumed vs included credits for the current cycle) and label fields so users do not confuse **billed usage** with **remaining monthly entitlement** when the API does not expose a remaining quota.
- **Organization- or enterprise-billed:** prefer the matching org/enterprise billing usage endpoints when the token and configuration allow; if RepoOS cannot infer org/enterprise context, show a short inline hint (“paste an org-scoped token” / “set org slug in Settings” — only if a minimal, existing config pattern exists; otherwise document dashboard fallback and optional future config in Notes).

For both providers:

- Keep the **Open dashboard** link.
- Reuse the existing **paste key / clear key** UX and `setDotEnvSecret` storage (new fixed env var names + `configKey` entries in the registry, following OpenRouter/opencode Go).
- On missing key, auth failure, unsupported plan, or upstream timeout: show the same safe, retryable error pattern as live rows today — **no stack traces**, **no token echo**.
- When live data is unavailable, the row still renders as today (note + dashboard link), not a blank failure state.

Copy under each label should explain freshness, units (USD vs credits), and limitations in one line.

## Acceptance criteria
- [ ] **Registry:** `deepinfra` and `github-copilot` rows in `src/core/providers/spend.ts` move to `kind: "live"` with new `envVar` / `configKey` fields, updated `note` strings, and dashboard URLs unchanged as fallbacks.
- [ ] **DeepInfra API:** Implement `parseDeepInfraChecklist`, `parseDeepInfraUsage`, and `fetchDeepInfraSpend` (or equivalent) with bearer auth, 8s timeout, typed null-on-unknown-shape parsers (same philosophy as OpenRouter/opencode Go). Unit tests pin real documented fields including **negative `stripe_balance` = spendable** and `recent` spend.
- [ ] **GitHub Copilot API:** Implement parser(s) + fetcher for the supported personal usage endpoint; document and handle 401/403/404 with user-facing messages (missing scope vs wrong account type). Do **not** claim “remaining quota” unless the response includes an explicit remaining/included pair — otherwise show usage/consumed only with honest labeling.
- [ ] **Routes:** Extend `GET /api/model-providers/:id/usage` and `POST /api/model-providers/:id/key` in `src/server/routes/model-providers.ts` for both ids; keys never logged or returned.
- [ ] **UI:** Extend `ModelProvidersPanel.vue` (and shared types) to render DeepInfra + Copilot live payloads alongside OpenRouter/opencode Go; extend `isLive()` (or replace with registry-driven `kind`) so auto-load on `hasKey` works for all live providers.
- [ ] **Settings:** If new `configKey` fields are added, expose them in Settings schema/UI per repo rule (or justify env-only in Notes if deliberately advanced).
- [ ] **Docs:** Update user-facing agents/model-provider docs to describe required token types/scopes, what each number means, and dashboard fallback.
- [ ] **Tests:** Route tests + component/unit coverage for new parsers and at least one happy-path + auth-failure path each; `repoos check --changed main` passes.
- [ ] **Shots:** Declare `## Shots` with `/agents?tab=model-providers` entries showing DeepInfra and GitHub Copilot rows with live data (or realistic fixture/dev keys), including error-state fallback if keys are absent in CI.

## Notes for AI
- **Follow the OpenRouter pattern** in `src/core/providers/spend.ts` and `src/server/routes/model-providers.ts`: separate parsers from fetchers; parallel fetches where multiple endpoints apply; per-part errors for partial success.
- **Env vars (proposed — adjust if repo already reserves names):** `REPOOS_DEEPINFRA_API_KEY`, `REPOOS_GITHUB_COPILOT_TOKEN` (or `REPOOS_GITHUB_TOKEN` if shared with other GitHub integrations — grep before inventing a second variable).
- **DeepInfra checklist** docs: https://docs.deepinfra.com/api-reference/billing/get-checklist — key fields `stripe_balance`, `recent`, `scoped_credits`, `suspended`.
- **DeepInfra usage** docs: https://docs.deepinfra.com/api-reference/billing/usage — parse defensively; add fixtures from documented schema only.
- **GitHub billing REST:** https://docs.github.com/en/rest/billing/usage — pick the endpoint(s) that match personal vs org billing; fine-grained PAT scopes must be listed in UI copy.
- **Copilot usage/billing overview:** https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/usage-and-billing — do not equate SDK metering with Copilot subscription quota unless the REST payload supports it.
- **Out of scope for this task:** Cursor, Claude Code, and the rest of the link-out rows (#0626 covers Cursor/Claude Code). Antigravity/Kiro remain link-outs.
- **Sibling:** #0626 — keep env-var naming consistent if both tasks touch GitHub token storage.
- Rebuild UI after changes (`bun run build:ui`).

## Original prompt
Replace dashboard link-outs for DeepInfra and GitHub Copilot on Agents > Model providers with supported live data where the account permits it. DeepInfra: evaluate documented authenticated `/payment/checklist` for credit balance and `/payment/usage` for spend, including balance sign and units. GitHub Copilot: evaluate the personal AI credit usage REST endpoint for personally billed plans, organization or enterprise endpoints for centrally billed plans, and documented quota interfaces where appropriate. Handle required scopes and account type clearly; do not equate billed usage with remaining entitlement. Reuse the existing key storage pattern, preserve safe errors and dashboard fallback, update UI copy and docs, and add parser, route, and component coverage.

Sources: https://docs.deepinfra.com/api-reference/billing/get-checklist ; https://docs.deepinfra.com/api-reference/billing/usage ; https://docs.github.com/en/rest/billing/usage ; https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/usage-and-billing

## Shots
```json
[{"target":"default","route":"/agents?tab=providers","label":"Model providers tab with DeepInfra and GitHub Copilot now live (key forms with Copilot scope field)","highlight":".mp-row"}]
```


## Activity

- 2026-10-02T08:51:36Z · created · unknown
- 2026-10-02T08:59:37Z · status inbox→ready
- 2026-10-02T08:59:39Z · status ready→active, branch
- 2026-10-02T08:59:40Z · needs_input
- 2026-10-02T09:33:55Z · needs_input
- 2026-10-02T09:35:03Z · body: section ## Problem
- 2026-10-02T09:35:04Z · body: section ## Desired UX
- 2026-10-02T09:35:05Z · body: section ## Acceptance criteria
- 2026-10-02T09:35:06Z · body: section ## Notes for AI
- 2026-10-02T09:35:07Z · body: section ## Original prompt
- 2026-10-02T09:37:35Z · body: section Shots
- 2026-10-02T09:42:35Z · status active→review
- 2026-10-02T09:57:36Z · needs_input
- 2026-10-02T10:03:03Z · body: section Shots
- 2026-10-02T10:31:52Z · needs_input (review-failed) cleared for review again by hello@repoos.org
- 2026-10-02T10:33:17Z · status review→active
