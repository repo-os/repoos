---
id: "0629"
title: please update agents page model providers to revert the g…
type: feature
status: draft
priority: p2
area: general
assigned_to: ""
created_by: hello@repoos.org
branch: ""
created_at: "2026-10-02T17:37:54Z"
updated_at: "2026-10-02T17:37:54Z"
---
please update agents page model providers to revert the github copilot to just the external link, because after trying the find the right api key I learned that it's deprecated:

Context:
GitHub has completely deprecated the user/billing/subscriptions REST API endpoints for personal accounts. It is now impossible to retrieve individual GitHub Copilot usage, billing, or subscription data programmatically using a Personal Access Token (PAT) or a Classic API key. The only remaining way for an individual user to view this data is manually via the web browser.
Instructions:
1. Modify the UI: Remove the input fields that request a GitHub "API Key" or "Personal Access Token (PAT)" for Copilot billing/usage tracking.
2. Update the UI text: Add a clear message informing the user that GitHub does not provide a public API for personal Copilot subscription info.

## Original prompt

please update agents page model providers to revert the github copilot to just the external link, because after trying the find the right api key I learned that it's deprecated:

Context:
GitHub has completely deprecated the user/billing/subscriptions REST API endpoints for personal accounts. It is now impossible to retrieve individual GitHub Copilot usage, billing, or subscription data programmatically using a Personal Access Token (PAT) or a Classic API key. The only remaining way for an individual user to view this data is manually via the web browser.
Instructions:
1. Modify the UI: Remove the input fields that request a GitHub "API Key" or "Personal Access Token (PAT)" for Copilot billing/usage tracking.
2. Update the UI text: Add a clear message informing the user that GitHub does not provide a public API for personal Copilot subscription info.

## Activity

- 2026-10-02T17:37:54Z · created · hello@repoos.org
