---
id: mur8wfy4-vhtdm
number: "0045"
title: "Copilot provider: remove API-key fields, link out instead"
status: processed
type: bug
area: agents
created_by: hello@repoos.org
created_at: "2026-10-02T17:36:57.532Z"
updated_at: "2026-10-02T18:15:45.325Z"
resolution: task
resolved_task: "0629"
---
please update agents page model providers to revert the github copilot to just the external link, because after trying the find the right api key I learned that it's deprecated:

Context:
GitHub has completely deprecated the user/billing/subscriptions REST API endpoints for personal accounts. It is now impossible to retrieve individual GitHub Copilot usage, billing, or subscription data programmatically using a Personal Access Token (PAT) or a Classic API key. The only remaining way for an individual user to view this data is manually via the web browser.
Instructions:
1. Modify the UI: Remove the input fields that request a GitHub "API Key" or "Personal Access Token (PAT)" for Copilot billing/usage tracking.
2. Update the UI text: Add a clear message informing the user that GitHub does not provide a public API for personal Copilot subscription info.
