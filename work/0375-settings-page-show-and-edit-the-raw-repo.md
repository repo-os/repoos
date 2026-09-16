---
id: "0375"
title: "Settings page: show and edit the raw repoos.toml, not just curated fields"
type: feature
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: ""
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-16T08:05:56Z"
updated_at: "2026-09-16T16:55:16Z"
---
## Problem

`SettingsView.vue` already exists and already edits a curated subset of
config (theme, notifications, tunnel, remote validation, general fields —
see `generalFields`/`form` in the component). But `repoos.toml` has grown
well beyond that: `[preview]`/`[[preview.targets]]` (#0362/#0370),
`[check]`/`[[check.themeScopes]]`/`[[check.contrastPairs]]` (#0351),
`[release]`, `[[deployments]]` (#0340), and more, none of which have any UI
surface. Confirmed live (2026-09-16): a user configuring task previews had
no way to see or verify what was in `[preview]` from the UI at all — the
only way to know it was wrong (or missing) was reading the file directly.

Every new config surface added a bespoke field to the curated form once;
that doesn't scale, and it means `repoos.toml` sections without a champion
to build their UI stay permanently invisible to someone who doesn't want to
open a text editor.

## Desired outcome

Add a raw view of `repoos.toml` to the Settings page — not a replacement for
the curated fields (those stay; they're nicer for the common cases they
cover), an addition/escape hatch for everything else:
- Show the file's current content, syntax-highlighted as TOML.
- Make it editable in place, saved back through whatever API already writes
  config (check if `SettingsView.vue`'s existing save path can be reused/
  extended, or if this needs a new endpoint — `repoos.toml` is a plain file,
  so a `GET`/`PUT` pair rooted at it may be simplest, but verify against how
  the curated form currently persists changes before assuming).
- Validate before writing: a malformed TOML save must not corrupt the file
  or silently produce a config the server can't load on next start. Surface
  a parse error inline rather than accepting anything.
- Decide how this interacts with the curated fields editing the SAME
  underlying file concurrently (e.g. does saving the raw view need to
  re-sync the curated form's state, or vice versa) — don't ship a raw editor
  that silently stomps a curated-field change made moments before, or vice
  versa.

## Constraints

- `repoos.toml` is git-tracked (per AGENTS.md's own config conventions) —
  writing to it from the UI is normal (the curated form already does this),
  but never write secrets into it; if a user pastes a secret into the raw
  editor by mistake, that's a user error the UI can't fully prevent, but
  don't make it easier by, say, auto-suggesting secret-shaped values.
- Follow the existing `SettingsView.vue` structure/patterns rather than
  building a second, disconnected settings surface.

## Acceptance criteria

- [ ] The Settings page shows the current `repoos.toml` content.
- [ ] It can be edited and saved from the UI, with TOML syntax highlighting.
- [ ] An invalid save is rejected with a clear inline error, never silently
      corrupting the file or leaving the server unable to start.
- [ ] Curated fields and the raw view stay consistent with each other (no
      silent overwrite of one by the other).
- [ ] `repoos check` passes.

## Related

- #0370 — the task whose own preview config surfaced there's no way to see
  `[preview]` from the UI at all today.

## Activity

- 2026-09-16T08:05:56Z · created · unknown
- 2026-09-16T16:55:15Z · model_override
- 2026-09-16T16:55:16Z · status inbox→ready
