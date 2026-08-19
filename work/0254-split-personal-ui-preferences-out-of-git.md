---
id: "0254"
title: Split personal UI preferences out of git-tracked repoos.toml
type: chore
status: ready
priority: p3
area: web
assigned_to: ai
created_by: ""
branch: ""
model_override: default
created_at: "2026-08-19T07:38:18Z"
updated_at: "2026-08-19T07:39:52Z"
---
## Activity

- 2026-08-19T07:38:18Z · created · unknown


## Problem

`repoos.toml` is git-tracked and mixes two different kinds of data: structural
project config that should be shared via git (`workDir`, `[[agents]]`,
`ntfyTopic`, `[auth]` settings, etc.) and personal cosmetic UI preferences
(`theme` — dark/light, `uiTheme` — which visual skin: classic/clear/gen
z/jelly) that change every time someone clicks around Settings. Because both
live in the same tracked file, toggling dark mode or switching UI skins
leaves `repoos.toml` permanently dirty in `git status`, and those personal
preferences get committed (or block clean commits) alongside real project
config changes.

## Desired UX

**Revised 2026-08-19, superseding the original `.repoos/local.toml` plan
below.** #0246 (native auth) has since shipped and is live on this
instance — RepoOS now has multiple real, distinct logged-in users
(`hello@repoos.org`, `njachowski@gmail.com`, `nick@tukapp.co`). That
changes the right answer: a *server-side* file, whether `repoos.toml` or
`.repoos/local.toml`, is still **one file shared by everyone who hits this
server**. If user A sets dark mode, it silently flips for user B too — not
actually "personal" at all now that there's more than one person.

`theme` and `uiTheme` move to the browser's `localStorage` instead —
`repoos.theme` / `repoos.uiTheme` keys, matching the existing
`repoos.newVersion` key convention already used in `stores/repo.ts`. Truly
scoped per-browser, not per-server-file, which is the only option that's
actually correct for personal preference in a multi-user instance. Zero
network round-trip to read or write either field. `repoos.toml` stops
carrying `theme`/`uiTheme` entirely going forward — no local override file
needed at all, closing the original git-diff-noise problem too.

**Tradeoff to flag to whoever builds this**: `localStorage` doesn't sync
across devices — set dark mode on a laptop, it won't follow you to your
phone, since it's tied to the browser, not the RepoOS account. True
cross-device sync would mean storing the preference against the row in
`auth_users` instead (real backend work: schema change, an API, and it
only applies when auth is enabled — no account to hang it off of
otherwise). Out of scope here; flagged in case it's wanted later as a
separate task.

## Relevant code (read before designing)

- `src/core/config.ts` — `getConfigSchema()` (~line 409) currently declares
  `theme`/`uiTheme` with `tier: "live"` alongside fields that
  should stay server-side/shared (`tunnelEnabled`, `ntfyEnabled`,
  `defaultTaskMode`, `autoEngineeringMode`, `maxActiveTasks`,
  `whisper.provider`, `whisper.apiKey`) — remove `theme`/`uiTheme` from
  this schema (or otherwise stop the server from reading/writing them),
  scope the removal to exactly those two keys.
- `src/server/routes/config.ts` (~line 267) — `PATCH /api/config` handler;
  stop accepting `theme`/`uiTheme` in the request body (or silently ignore
  them) since the client no longer sends them here.
- `src/ui-app/src/stores/config.ts` — `applyTheme()`/`setTheme()`,
  `applyUiTheme()`/`setUiTheme()` currently PATCH the server and set
  `document.documentElement.dataset.theme`/`dataset.uiTheme`. Rework to
  read/write `localStorage` directly instead of calling `/api/config` for
  these two; keep applying the `dataset.theme`/`dataset.uiTheme` DOM
  attributes exactly as today (that part is unrelated to where the value
  is persisted).
- `src/ui-app/index.html` — the inline pre-paint script currently does
  `fetch("/api/config")` before first render specifically to avoid a
  flash-of-wrong-theme. Once the value lives in `localStorage`, that
  fetch is not just unnecessary but actively worse (a network round-trip
  introduces its own flash window) — replace it with a synchronous
  `localStorage.getItem("repoos.theme")` read, which is available
  immediately with no network wait. This is a net simplification, not
  just a relocation.
- `src/commands/init.ts` — unaffected; `repoos.toml` scaffolding never
  included `theme`/`uiTheme` as anything other than defaults, so nothing
  to change here.
- `.gitignore` — no change needed; nothing new touches the filesystem.

## Acceptance criteria

- [ ] `theme` and `uiTheme` are read from and written to `localStorage` (`repoos.theme` / `repoos.uiTheme`) on the client, never sent to or stored by the server.
- [ ] All other config fields continue to read/write `repoos.toml` via the server exactly as today.
- [ ] A fresh browser with no `localStorage` entry falls back to the existing defaults (`DEFAULT_CONFIG.theme` = `"system"`, resolved via `prefers-color-scheme`, same as today's fallback logic in `effectiveTheme`).
- [ ] The pre-first-paint theme script reads `localStorage` synchronously — no fetch, no flash of wrong theme, and no regression versus today's (already-imperfect, network-dependent) flash prevention.
- [ ] `repoos.toml` on an existing repo that still has `theme =` / `uiTheme =` lines from before this change is handled gracefully — those lines are simply no longer read (not an error, not migrated, just ignored); a follow-up commit may clean stale lines out of tracked `repoos.toml` files but that's not required for this task to land.
- [ ] Existing config tests are updated for the new behavior, including any that currently assert on `repoos.toml`'s written contents for `theme`/`uiTheme` (`src/ui-app/tests/whisper-config.test.ts`, `config-tunnel.test.ts`, `built-in-agents.test.ts` — check these for assumptions that need updating).
- [ ] Add test coverage: setting theme/uiTheme writes to `localStorage` and never triggers a `PATCH /api/config` call; a value already in `localStorage` is read back correctly; an empty `localStorage` falls back to system/default; switching two different values in the same browser session doesn't leak into `repoos.toml`.
- [ ] `repoos check` passes.

## Notes for AI

- Out of scope: any config field beyond `theme`/`uiTheme`; per-account
  (server-side, tied to `auth_users`) theme sync across devices — flagged
  above as a possible separate follow-up, not part of this task; changing
  where `[auth]` secrets live (already handled in #0246, which added
  `REPOOS_AUTH_SESSION_SECRET`/`REPOOS_RESEND_API_KEY`/`REPOOS_GOOGLE_CLIENT_SECRET`
  env-var fallbacks for those).
- This came out of a conversation while reviewing #0246 (native auth) — the
  auth work is what surfaced `repoos.toml` being git-tracked as a live
  problem (secrets), and this task is the follow-up for the unrelated but
  adjacent noisy-diff problem (personal UI prefs), not a dependency of it.
  The plan below was revised once native auth actually went live and
  turned "personal preference" into a real multi-user concern rather than
  a single-developer one.

## Activity

- 2026-08-19T07:39:32Z · model_override
- 2026-08-19T07:39:52Z · status inbox→ready
