---
id: "0366"
title: "Deployments: wire dashboard_url links, drop noisy 'build status unknown' badge"
type: chore
status: active
priority: p3
area: web
assigned_to: ai
created_by: ""
branch: feat/deployments-wire-dashboard-url-links-dro
created_at: "2026-09-16T05:01:19Z"
updated_at: "2026-09-16T05:01:24Z"
---
## Problem

Follow-up from #0365's Deployments redesign, per user feedback:

1. Every matrix cell shows an identical "build status unknown" badge —
   noisy and unhelpful since it never varies and the explanatory note at the
   bottom of the page already covers it once. Remove the per-cell badge.
2. `dashboardUrl` (DeploymentConfig.dashboardUrl / repoos.toml's `dashboard_url`)
   already exists and already renders a "Dashboard ↗" link per cell when set,
   but every row in this repo's own repoos.toml has it blank. The user
   confirmed only ONE URL is needed per service (not per branch) — Cloudflare's
   deployment history page for a Worker already lists every branch's builds:
   - Landing page (both branches): https://dash.cloudflare.com/55041dbc1231e6d4ef135135ccc7d4a2/workers/services/view/repoos-landing/production/deployments
   - Docs (both branches): https://dash.cloudflare.com/55041dbc1231e6d4ef135135ccc7d4a2/workers/services/view/repoos-docs/production/deployments

## Desired outcome

1. Remove the `.dep-status`/"build status unknown" badge from
   src/ui-app/src/views/DeploymentsView.vue's matrix cells. Keep the existing
   explanatory note at the bottom of the page as-is (it already covers this).
2. Set `dashboard_url` on all four [[deployments]] rows in repoos.toml to the
   two URLs above (same URL for both branches of a given service), so the
   "Dashboard ↗" link renders and gives a real, if manual, way to check build
   status on Cloudflare.

## Notes for AI

- Real (automatic) build status via Cloudflare's API is explicitly out of
  scope here — it needs a new API token/credential and account-to-project
  mapping RepoOS doesn't have. That's a separate, bigger follow-up if ever
  wanted; this task is just the link + noise cleanup.
- `repoos check` passes. This is a tiny, low-risk change — no new tests
  needed beyond confirming existing deployments tests still pass.

## Activity

- 2026-09-16T05:01:19Z · created · unknown
- 2026-09-16T05:01:24Z · branch
- 2026-09-16T05:01:24Z · status inbox→active
- 2026-09-16T05:01:24Z · note: Implementing directly per explicit user request in chat — claiming immediately to avoid a race with auto-dispatch.
