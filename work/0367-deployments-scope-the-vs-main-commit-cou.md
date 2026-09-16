---
id: "0367"
title: "Deployments: scope the vs-main commit count to each service's subdir"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/deployments-scope-the-vs-main-commit-cou
created_at: "2026-09-16T05:35:56Z"
updated_at: "2026-09-16T05:36:01Z"
---
## Problem

User-reported and verified: the Deployments page's branch cards say "N commits
behind main," but that count is computed for the WHOLE branch (unscoped),
while each service's actual freshness ("Latest branch change") is correctly
scoped to its own `subdir`. This is misleading — right now prod shows "17
commits behind main," but `git rev-list --count origin/prod..main -- landing`
and `-- user-docs` both return 0: none of those 17 commits touched either
service. A user reading the page reasonably assumes the count is relevant to
the specific app they're looking at; it isn't.

Verified live (2026-09-16): `git log origin/prod..main --oneline` shows all 17
commits are this session's own task/doc bookkeeping and code changes to
`src/server/deployments.ts` / `src/ui-app/src/views/DeploymentsView.vue` /
`repoos.toml` — none touch `landing/` or `user-docs/`.

## Desired outcome

Keep the branch-level `mainSync` badge on the branch card as-is (it's honestly
whole-repo/whole-branch, useful for judging overall branch staleness — no
scope change there). ADD a subdir-scoped count per matrix CELL (service ×
branch) that's directly comparable to what "Latest branch change" already
scopes to, so a user can see the real per-service difference from local main —
not just the whole-branch number, and not just the single latest commit
freshness already shown, but how many commits in the behind/ahead range
actually touch this service's subdir. Compute it the same way `branchVsMain`
does (ahead/behind counts vs local `main`), just with the `-- <subdir>`
pathspec appended, scoped per (branch, subdir) — reuse the SAME per-
(branch,subdir) caching `rowFreshness` already uses (git calls doubled
otherwise: one per row would repeat identical work for rows sharing a subdir).
Rows with no subdir configured need no new field — the branch-level number
already IS their scope (branch-wide == unscoped == the whole thing).

Render it in the matrix cell, near "Latest branch change" — something like "0
commit(s) behind main touch landing/" when nonzero, omit or say something
sensible (e.g. nothing, since there's nothing to add) when the branch-level
count is already 0 for that direction.

## Notes for AI

- Relevant code: src/server/deployments.ts (branchVsMain for the pattern to
  mirror scoped with a subdir pathspec; rowFreshness and its per-(branch,
  subdir) caching in getDeploymentsStatus — extend rather than duplicate),
  src/ui-app/src/views/DeploymentsView.vue (matrix cell rendering).
- Existing tests: src/ui-app/tests/deployments.test.ts's mockGit `counts` map
  already supports arbitrary rev-list --count keys (including `A..B -- path`
  once you push the pathspec into the args the mock keys off of — check how
  the mock builds its lookup key from `args[args.length - 1]` and whether a
  trailing `-- subdir` pathspec changes what that last arg is; adjust the mock
  or the key format as needed, whichever is less invasive).
- `repoos check` passes.

## Activity

- 2026-09-16T05:35:56Z · created · unknown
- 2026-09-16T05:36:00Z · branch
- 2026-09-16T05:36:01Z · status inbox→active
- 2026-09-16T05:36:01Z · note: Implementing directly per explicit user request in chat — claiming immediately to avoid a race with auto-dispatch.
