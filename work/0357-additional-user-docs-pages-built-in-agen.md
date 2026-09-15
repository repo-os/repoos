---
id: "0357"
title: "Additional user-docs pages: built-in agents, authentication, deployments/releases"
type: feature
status: inbox
priority: p3
area: web
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-15T15:50:48Z"
updated_at: "2026-09-15T15:50:48Z"
---
## Problem

#0341 covers the top 10 user-docs pages a first-time RepoOS adopter needs.
Three more topics are real and worth documenting but lower priority — spun
out here so #0341 doesn't grow unboundedly. See #0341's "Deliberately
deferred" section for the reasoning.

## Pages worth adding

- **Built-in agents deep-dive** — Tech Debt, Performance, Architect, Design,
  and Docs Debt (#0354, once built) on the "Build your team" page: what each
  one scans for, its config (CLI/model/schedule), what "Run now" does, and
  what good output looks like (inbox tasks for Tech Debt/Performance, a
  markdown report under `docs/agents/<Name>/` for Architect/Design). The
  Agents page added in #0341 should already carry one paragraph distinguishing
  these from coding-agent roles and pointing here — don't duplicate that
  distinction, just build on it.
- **Authentication** — email OTP provider setup (`auth.emailProvider` in
  `repoos.toml`, the Resend integration), the optional "Sign in with Google"
  button (`auth.google.clientId`), and the dev-login backdoor for local
  development (`REPOOS_AUTH_DEV_BACKDOOR_CODE` in `.env`, never honored when
  `NODE_ENV=production`). Be careful with the backdoor's framing: it's a real
  documented feature for local dev convenience, not something to bury, but
  the page must be unambiguous that it's dev-only and never works in
  production — check `src/server/routes/auth.ts` for the exact guard before
  writing this claim.
- **Deployments and releases** — the `[release]` block (git-tag-triggered
  GitHub Releases via a workflow) and `[[deployments]]` rows (git-connected
  provider deploys, one row per service+branch) in `repoos.toml`. Both are
  opt-in and this repo's own `repoos.toml` is a real, working example to
  crib the shape from (without copying its actual values).

## Constraints

Same as #0341: these are user-docs (`user-docs/`), not build-context docs
(`docs/`) — written for someone adopting RepoOS, not working on RepoOS's own
codebase. Verify claims against the actual code (`src/server/routes/auth.ts`,
`src/core/config.ts`, `.github/workflows/release.yml`) rather than inferring.
Add each new page to the hand-curated sidebar in
`user-docs/.vitepress/config.mts` — it won't appear in navigation otherwise.
Verify locally with `just user-docs-dev` / `just user-docs-build`; `repoos
check` does not cover this directory.

## Related

- #0341 — the higher-priority top-10 pages this was split from.

## Activity

- 2026-09-15T15:50:48Z · created · unknown
