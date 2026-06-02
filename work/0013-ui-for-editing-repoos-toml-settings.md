---
id: "0013"
title: UI for editing repoos.toml settings
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: nick
branch: feat/0009-settings-ui
created_at: 2026-06-02T09:10:00Z
updated_at: 2026-06-02T09:10:00Z
---
## Problem

`repoos.toml` is currently edited by hand in a text editor. As more settings
land (port, agent command, worktree dir, concurrency cap, strict-build, display
name, theme), a Settings view in the web UI is the natural home — especially for
the agent-config flow, where detecting and selecting an agent should write to
the toml rather than asking the user to hand-edit it.

But the toml mixes harmless preferences with load-bearing operational config.
A settings UI that freely edits everything is a way to break a running server
from a browser. The task is to edit the SAFE, intended subset well — not to
expose the whole file as a form.

## Desired outcome

A Settings view in the web UI that reads current config and writes changes back
to `repoos.toml`, with a clear, deliberate boundary around what is editable,
honest handling of settings that need a restart, and safe file writes that
preserve the rest of the toml.

## Field policy (the core of this task)

Classify every setting into one of three tiers; the UI treats them differently:

- **Live-editable** — safe, takes effect immediately, no restart. E.g. display
  name, theme/appearance, anything cosmetic. Editable freely.
- **Restart-required** — safe to change but only applies on server restart.
  E.g. `port`, `host`. Editable, but the UI must clearly label "takes effect
  after `ros serve` restart" and not pretend it applied live.
- **Guarded / advanced** — operational config where a bad value breaks things:
  `worktreeDir`, agent command, `maxConcurrentSessions`, `strictBuild`,
  `cacheDir`, `workDir`, `docsDir`. Editable only behind an explicit "Advanced"
  affordance with a warning, OR read-only in v1 with a note to edit by hand.
  Decide per-field; default to caution.

Document the tier of each field. New settings must be classified when added.

## Acceptance criteria

- [ ] `GET /api/config` returns the current resolved config + each field's tier
      and whether it's restart-required (so the UI can render correctly)
- [ ] `PATCH /api/config` writes changes back to `repoos.toml`, validating
      values server-side (reject an out-of-range port, a non-existent
      worktreeDir parent, an empty agent command, etc.) with clear errors
- [ ] Writing PRESERVES the rest of the toml — comments, unknown keys, and
      formatting of untouched sections survive the round-trip. Do NOT rewrite
      the whole file from a parsed object if that drops comments.
- [ ] Restart-required fields are visibly labelled as such; the UI does not
      imply they applied live
- [ ] Guarded fields are gated behind an explicit affordance (or read-only in
      v1) — never freely editable alongside cosmetic ones
- [ ] Server-side validation is authoritative; the UI may pre-validate but the
      server must reject bad values regardless of client
- [ ] Settings view matches the existing UI design language
- [ ] If a field is invalid or missing, the UI shows the effective default and
      indicates it's a default, not an explicit value
- [ ] Concurrent-edit safety: if the toml changed on disk since the UI loaded
      it, re-read and merge / warn rather than clobbering (mirror the task
      safe-write pattern)

## Notes for AI

- The toml is a FILE and the source of truth — treat writes with the same care
  as task-file writes. The existing config loader only parses a flat subset;
  WRITING toml is new. The safest approach preserves comments and untouched keys
  — consider a targeted line/section edit over a full serialize-from-object that
  would discard comments. If you must serialize, ensure comments and unknown
  keys survive, or explicitly document what's lost.
- Do NOT let the UI change a setting in a way that silently breaks the running
  server. `port`/`host` are the obvious trap: changing them does nothing until
  restart — label clearly, don't apply live.
- Validate server-side. A browser form is not a trust boundary. Range-check the
  port, existence-check directory paths, non-empty-check the agent command.
- This pairs with the agent-config flow (selecting/detecting an agent writes the
  agent command + related fields here). If that flow isn't built yet, design the
  config schema so agent settings slot in cleanly, but don't build agent
  detection in this task.
- This task's frontmatter uses `created_at` (UTC/Z) per the current format —
  match whatever 0007 landed (field name + precision).

## Scope

- v1: read config, edit live-editable + restart-required (clearly labelled),
  guarded fields read-only or behind an explicit advanced gate.
- Defer: agent auto-detection, live-reload of restart-required settings without
  a restart, per-field edit history. Note the intent; don't build.

## Related

- Pairs with the getting-started / agent-config flow (settings is where agent
  selection persists).
- Toml-write safety parallels the task-file safe-write pattern in the server.
