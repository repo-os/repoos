---
id: "0629"
title: Revert GitHub Copilot provider to external link only
type: refactor
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-10-02T17:37:54Z"
updated_at: "2026-10-02T17:38:38Z"
---
## Problem

The Agents page model providers list treats GitHub Copilot as a **live** provider: it collects a GitHub API key or personal access token (and related scope) and tries to show billed Copilot usage from GitHub’s billing API. GitHub has deprecated the personal-account `user` / `billing` / `subscriptions` REST endpoints that powered that flow. A PAT or classic API key can no longer retrieve individual Copilot usage, billing, or subscription data programmatically; the only supported path for an individual is the Copilot settings page in a browser.

Keeping token fields and live-usage UI misleads users into hunting for credentials that cannot work and suggests RepoOS can show data GitHub no longer exposes for personal accounts.

## Desired UX

GitHub Copilot on **Agents → Model providers** behaves like other **link** providers (e.g. Codex, Kiro): a short explanatory note, no API key or PAT fields, and no scope or usage widgets. The primary action is an external link to GitHub Copilot settings (e.g. `https://github.com/settings/copilot`).

Copy clearly states that GitHub does **not** provide a public API for personal Copilot subscription, billing, or usage data, and that users must view that information manually in the browser.

## Acceptance criteria

- [ ] The GitHub Copilot row no longer shows inputs for an API key, PAT, or any credential used for Copilot billing/usage tracking.
- [ ] The GitHub Copilot row no longer shows scope fields or live usage summaries tied to the GitHub billing API.
- [ ] GitHub Copilot is presented as a link-out provider with an external link to Copilot settings, consistent with other `kind: "link"` rows.
- [ ] User-visible text on the Copilot row explains that GitHub does not offer a public API for personal Copilot subscription/billing/usage and that details must be checked on GitHub’s site.
- [ ] Automated tests for model providers are updated so Copilot is no longer asserted as a live/keyed provider or exercised through Copilot usage save/fetch flows.
- [ ] `repoos check --changed main` passes (format, build, tests).

## Notes for AI

- **Primary surfaces:** `src/core/providers/spend.ts` (change `github-copilot` from `kind: "live"` to `kind: "link"`; drop `envVar` / `configKey` / `scopeEnvVar`; rewrite `note` per Desired UX), `src/ui-app/src/components/ModelProvidersPanel.vue` (remove Copilot-specific key, scope, and usage UI branches), `src/server/routes/model-providers.ts` and Copilot usage helpers in `src/core/providers/spend.ts` if they become unused.
- **Tests:** `src/ui-app/tests/model-providers-panel.test.ts`, `src/ui-app/tests/model-providers-routes.test.ts`, `src/ui-app/tests/model-provider-spend.test.ts`, and types in `src/ui-app/src/types.ts` as needed.
- **Assumption:** Revert personal-account Copilot integration entirely (UI + catalog + dead server usage/key paths). Do not add a replacement API integration in this task.
- **Do not** change unrelated model providers, agent CLI detection for `github copilot`, or landing/marketing copy unless required for consistency.
- Match existing link-provider patterns for layout, tooltips, and external links; follow AGENTS.md UI conventions (no native `confirm`/`title`, teleported overlays if any new floating UI).
- After UI changes, run `bun run fmt` and `bun run build:ui` (or full `bun run build`) before check.

## Scope

**In scope:** Agents model providers UX and catalog for GitHub Copilot; removal of Copilot PAT/key/scope collection and live usage display; test and type updates; removal of now-dead Copilot usage API wiring if nothing else calls it.

**Out of scope:** Org or enterprise Copilot billing APIs (not requested); new third-party usage sources; changes to how RepoOS invokes Copilot as an agent CLI.

## Related

- Prior work that introduced Copilot as a live provider (tests reference **#0625**).

## Original prompt

please update agents page model providers to revert the github copilot to just the external link, because after trying the find the right api key I learned that it's deprecated:

Context:
GitHub has completely deprecated the user/billing/subscriptions REST API endpoints for personal accounts. It is now impossible to retrieve individual GitHub Copilot usage, billing, or subscription data programmatically using a Personal Access Token (PAT) or a Classic API key. The only remaining way for an individual user to view this data is manually via the web browser.
Instructions:
1. Modify the UI: Remove the input fields that request a GitHub "API Key" or "Personal Access Token (PAT)" for Copilot billing/usage tracking.
2. Update the UI text: Add a clear message informing the user that GitHub does not provide a public API for personal Copilot subscription info.

## Activity

- 2026-10-02T17:37:54Z · created · hello@repoos.org
- 2026-10-02T17:38:38Z · status draft→inbox, title, area, type, body
