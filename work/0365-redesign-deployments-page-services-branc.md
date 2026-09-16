---
id: "0365"
title: "Redesign Deployments page: services×branches matrix, vs-main sync status instead of raw ahead/behind"
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/redesign-deployments-page-services-branc
created_at: "2026-09-16T04:31:37Z"
updated_at: "2026-09-16T04:51:47Z"
---
## Problem

The current Deployments page (src/ui-app/src/views/DeploymentsView.vue) shows a
branch strip (one card per branch) plus a separate flat grid of (service,
branch) rows. Two problems with it, both raised by the user after reviewing a
redesign mockup from another AI:

1. The layout is confusing — services and branches aren't visually related to
   each other; the same logical service (e.g. "Landing page") appears as two
   unrelated-looking cards ("Landing page (prod)" and "Landing page (dev)").
2. The branch strip's sync indicator (`↑ 0 ↓ 0 vs origin/prod`) shows
   ahead/behind of the branch's OWN origin ref — which is rarely what the user
   actually wants to know. Their dev flow: they work locally on `main`; both
   the "main" deployment target (origin/main) and the "prod" deployment target
   (origin/prod) should be compared against LOCAL `main`, not against each
   branch's own origin. For the "main" target this answers "is the dev site
   caught up with my local work"; for "prod" it answers "is prod caught up
   with what's already live on the dev site" (an acceptable simplification the
   user explicitly approved over a stricter prod-vs-origin/main comparison, for
   ease of implementation).

## Desired outcome

1. **New sync semantics**: for each configured deployment branch, compute and
   display where `origin/<branch>` (what's actually live) stands relative to
   the LOCAL `main` branch in the checkout — not the branch's own origin ref.
   States: same as main / N commit(s) behind main (fast-forwardable — reuse
   the existing `ffFrom` badge for this, don't duplicate the phrase) / N
   commit(s) ahead of main (unusual — flag distinctly) / diverged from main.
   Replace the `↑ N ↓ N vs origin/<branch>` chips with this. The existing
   ahead/behind-vs-own-origin numbers can stay in the deploy confirm dialog
   (they're about push safety, a different concern) but should NOT be the
   headline metric on the branch cards.
2. **Matrix layout**: rows = services, columns = branches, following the
   attached mockup's information architecture (services×branches grid, one
   branch-summary card per branch above it, a legend, an explanatory note)
   — NOT its literal light-only color palette, which doesn't fit this
   project's theme-aware (light/dark) CSS custom properties. Reuse the
   project's existing tokens (--cyan, --violet, --border, --txt-dim, etc. —
   see src/ui-app/src/style.css) instead of the mockup's hardcoded hex colors.
   Current config has no way to say two [[deployments]] rows are "the same
   service" across branches (their `name` differs: "Landing page (prod)" vs
   "Landing page (dev)") — add an optional `service` field to
   `DeploymentConfig`/repoos.toml (`service = "Landing page"`), defaulting to
   the row's own `name` when absent (so existing configs without it keep
   working exactly as today, ungrouped). Group rows into the matrix by this
   field client-side.
3. Keep every existing behavior working: the deploy confirm dialog (with
   ffFrom fast-forward preview, dirty-checkout guard, behind-origin warning),
   the dirty-checkout banner, the empty/no-config state, success/error
   banners, "Latest branch change" freshness line (rename from "last push" per
   the mockup's more honest framing — it's not a confirmed deploy, just the
   newest relevant commit) and its explanatory note.

## Notes for AI

- Mockup reference (informs layout/wording, NOT literal styling — it's a
  light-only static HTML prototype): /Users/nick/screenshots/repoos_deployments_mockup.html
- Relevant code: src/ui-app/src/views/DeploymentsView.vue, src/server/deployments.ts
  (getDeploymentsStatus, branchSummary — add the new vs-main computation
  alongside/replacing the display use of the existing ahead/behind), src/core/types.ts
  (DeploymentConfig), src/core/config.ts (TOML parsing for the new `service` field).
- Existing tests: src/ui-app/tests/deployments.test.ts has a scripted git mock
  (mockGit/MockSpec with `counts`/`ancestors` maps) — extend it for the new
  vs-main computation rather than inventing a new mocking approach.
- Update repoos.toml's own [[deployments]] rows to add `service = "Landing page"`
  / `service = "Docs"` so this repo's own page demonstrates the new grouping.
- `repoos check` passes.

## Activity

- 2026-09-16T04:31:37Z · created · unknown
- 2026-09-16T04:31:44Z · branch
- 2026-09-16T04:31:44Z · status inbox→active
- 2026-09-16T04:31:44Z · note: Implementing directly per explicit user request in chat (attached redesign mockup + specific vs-main sync semantics) — claiming immediately to avoid a race with auto-dispatch.
- 2026-09-16T04:45:41Z · status active→review
- 2026-09-16T04:45:41Z · note: repoos check passed clean (build + 47 tests: extended deployments.test.ts + new deployments-view.test.ts component suite). Landing directly per explicit user request ('incorporate this as a hotfix on main') rather than opening a PR/waiting for review — matches this repo's own hotfix semantics for a small, well-scoped, user-reviewed-mockup UI change.
- 2026-09-16T04:45:55Z · status review→done
- 2026-09-16T04:45:55Z · note: Landed as a hotfix per explicit user request. Merging feat/redesign-deployments-page-services-branc into main.
- 2026-09-16T04:51:47Z · status done→review
