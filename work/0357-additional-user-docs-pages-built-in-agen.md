---
id: "0357"
title: "Additional user-docs pages: built-in agents, authentication, deployments/releases"
type: feature
status: ready
priority: p3
area: web
assigned_to: ai
created_by: ""
branch: ""
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-09-15T15:50:48Z"
updated_at: "2026-09-15T17:24:50Z"
---
## Problem

#0341 covers the top 10 user-docs pages a first-time RepoOS adopter needs.
Three more topics are real and worth documenting but lower priority — spun
out here so #0341 doesn't grow unboundedly. See #0341's "Deliberately
deferred" section for the reasoning.

## Watch for this specific failure mode (found live, 2026-09-16)

An audit of #0341's already-written pages found the same mistake twice: a
feature that is **opt-in and off by default in every fresh `repoos init`**
(auth) got described as if it always applies — "a task preview runs with
RepoOS's auth enabled, so you'll hit a login screen" — with no conditional
framing. `auth.enabled` defaults to `false` (`src/core/config.ts`) and a
fresh `repoos.toml` ships with `[auth]` entirely commented out, so most
adopters never see a login screen at all. Fixed in commit `143c2fe6` — read
that diff before writing the Authentication page below; it's the second time
this exact pattern has bitten these docs and this task's Authentication page
is squarely in the same danger zone. The correct framing (already used
correctly in `configuration.md`): lead with "X is off by default," then
describe what happens once it's turned on — never state the enabled
behavior as if it's what every reader will experience.

The same audit also found three pages (getting-started.md, concepts.md,
cli.md) still describing the UI smoke test as an unconditional part of
`repoos check`, left stale after #0348 made it opt-in — a duplication
problem as much as an accuracy one: the same fact was independently written
in four places, and three drifted out of sync when the fact changed in one.
When this task's built-in-agents deep-dive describes what `repoos check`
does or doesn't cover, or when any of these three new pages restates a fact
that already has a canonical home (`check.md` for the check gate,
`configuration.md` for config defaults), link to the canonical page instead
of re-describing it — don't create a fifth place for a fact to go stale.

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
  writing this claim. Lead the whole page with "auth is off by default" per
  the note above — every subsection describing enabled-auth behavior should
  read as conditional on having turned it on, not as default behavior.
- **Deployments and releases** — the `[release]` block (git-tag-triggered
  GitHub Releases via a workflow) and `[[deployments]]` rows (git-connected
  provider deploys, one row per service+branch) in `repoos.toml`. Both are
  opt-in and this repo's own `repoos.toml` is a real, working example to
  crib the shape from (without copying its actual values) — same "opt-in,
  off by default" framing applies here too.

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
- 2026-09-15T15:59:26Z · status inbox→ready
- 2026-09-15T15:59:33Z · model_override
- 2026-09-15T17:24:50Z · body
