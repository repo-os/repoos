---
id: "0254"
title: Split personal UI preferences out of git-tracked repoos.toml
type: chore
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: ""
branch: ""
model_override: default
created_at: "2026-08-19T07:38:18Z"
updated_at: "2026-08-19T07:39:32Z"
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

`theme` and `uiTheme` move to a new file, `.repoos/local.toml`, which is
machine-local and gitignored (`.repoos/` is already gitignored, so this is
free). Everything else stays in `repoos.toml` as today. Loading config
merges both files (local overrides, since it's more specific to the
machine); writing a `theme`/`uiTheme` change from Settings writes to
`.repoos/local.toml` instead of `repoos.toml`; a fresh clone with no
`.repoos/local.toml` falls back to the existing defaults
(`DEFAULT_CONFIG.theme` / `DEFAULT_CONFIG.uiTheme`), same as it does today
for a missing `repoos.toml`.

## Relevant code (read before designing)

- `src/core/config.ts` — `loadConfig()` (~line 281) parses `repoos.toml`;
  `patchTomlConfig()` (~line 689) does the actual file write, called from the
  PATCH handler. `getConfigSchema()` (~line 409) is where `theme`/`uiTheme`
  are declared `tier: "live"` — **`tier: "live"` is not the right split
  criterion**, plenty of other fields share that tier (`tunnelEnabled`,
  `ntfyEnabled`, `defaultTaskMode`, `autoEngineeringMode`, `maxActiveTasks`,
  `whisper.provider`, `whisper.apiKey`) and those are legitimate
  shared/operational config, not personal preference — scope this to exactly
  `theme` and `uiTheme` unless a clear case emerges for adding more.
- `src/server/routes/config.ts` (~line 267) — `PATCH /api/config` handler,
  calls `patchTomlConfig` today; needs to route `theme`/`uiTheme` writes to
  the local file instead.
- `src/commands/init.ts` (~line 181) — `repoos init` scaffolds
  `repoos.toml`; shouldn't need to change, since `.repoos/local.toml`
  doesn't need scaffolding (defaults cover its absence).
- `.gitignore` — already ignores `.repoos/`, so no change needed there, just
  confirm `.repoos/local.toml` isn't accidentally excluded from that ignore
  by some more-specific rule.

## Acceptance criteria

- [ ] `theme` and `uiTheme` are read from and written to `.repoos/local.toml`, not `repoos.toml`.
- [ ] All other config fields continue to read/write `repoos.toml` exactly as today.
- [ ] `.repoos/local.toml` wins over `repoos.toml` if a value somehow exists in both (more specific, machine-local override).
- [ ] A repo with no `.repoos/local.toml` (fresh clone, or an existing repo before this change ships) behaves exactly as it does now — no migration step required, defaults apply.
- [ ] `repoos init` is unchanged — it keeps scaffolding structural `repoos.toml` config as today; `.repoos/local.toml` is never scaffolded, only created on first write (same lazy-create pattern `patchTomlConfig` already uses for `repoos.toml`).
- [ ] Existing config tests still pass, including any that assert on `repoos.toml`'s exact written contents around `theme`/`uiTheme` (`src/ui-app/tests/whisper-config.test.ts`, `config-tunnel.test.ts`, `built-in-agents.test.ts` — check these for assumptions that need updating).
- [ ] Add test coverage for the new split: writing `theme`/`uiTheme` lands in `.repoos/local.toml` and not `repoos.toml`; `.repoos/local.toml` overrides `repoos.toml` when both set a value; defaults apply when `.repoos/local.toml` is absent.
- [ ] `repoos check` passes.

## Notes for AI

- Out of scope: any config field beyond `theme`/`uiTheme`; changing where
  `[auth]` secrets live (already handled in #0246, which added
  `REPOOS_AUTH_SESSION_SECRET`/`REPOOS_RESEND_API_KEY`/`REPOOS_GOOGLE_CLIENT_SECRET`
  env-var fallbacks for those).
- This came out of a conversation while reviewing #0246 (native auth) — the
  auth work is what surfaced `repoos.toml` being git-tracked as a live
  problem (secrets), and this task is the follow-up for the unrelated but
  adjacent noisy-diff problem (personal UI prefs), not a dependency of it.

## Activity

- 2026-08-19T07:39:32Z · model_override
