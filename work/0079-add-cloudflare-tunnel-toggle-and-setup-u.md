---
id: "0079"
title: Add Cloudflare Tunnel toggle and setup UI to Settings page
type: feature
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/add-cloudflare-tunnel-toggle-and-setup-u
created_at: "2026-08-11T05:59:26Z"
updated_at: "2026-08-11T13:01:51Z"
---
## Problem

RepoOS can publish local apps securely via Cloudflare Tunnel + Access
(`repoos tunnel ...`, see #68), but that entire feature is CLI-only today.
There's no way to discover or enable it from the web UI. A user who wants to
expose their RepoOS instance (or an app running under it) has to already know
the `repoos tunnel` subcommands exist and drive them by hand in a terminal.
The Settings page (`src/ui-app/src/views/SettingsView.vue`) is where users
already go to turn optional capabilities on, so tunnel publishing should be
surfaced there as an explicit, opt-in toggle.

## Desired UX

- A new setting appears on the Settings page (alongside the existing General
  / Advanced setting groups) that lets the user enable Cloudflare Tunnel
  publishing. It is off/disabled by default — this is an opt-in feature, not
  something enabled automatically.
- Turning it on is what triggers setup: the user shouldn't need to already
  know about `repoos tunnel setup` from the CLI. The toggle should drive (or
  clearly link to) the setup flow described in #68 — checking for
  `cloudflared`, walking through `cloudflared tunnel login`, and configuring
  the machine's tunnel — rather than just flipping a config bit with no
  feedback.
- Because that setup flow (and ongoing management: creating tunnels per app,
  managing the email allowlist, viewing status) involves multiple steps and
  more explanation/instructions than fit in a single settings row, this UI
  goes in a side panel rather than inline in the settings list — the same
  kind of slide-out side panel already used for task details
  (`src/ui-app/src/components/TaskDrawer.vue`, opened via `ui.openTask` /
  `useUiStore`), sized similarly (matching `ui.drawerWidth`, resizable,
  docked to the side of the screen).
- Enabling the toggle in Settings opens this panel. The panel is where the
  actual instructions/steps and any tunnel management (app list, hostnames,
  allowlist) live, keeping the main Settings page itself uncluttered.
- Disabling the toggle should stop offering/using the tunnel from the UI
  (exact effect on any already-running tunnel is up to the AI's judgment
  during implementation — see Notes).

## Acceptance criteria

- [ ] Settings page has a new "Cloudflare Tunnel" (or similarly named)
      setting with an enable/disable toggle, off by default, following the
      existing `setting-row` / `Switch` pattern used elsewhere on the page.
- [ ] Enabling the toggle opens a side panel, built as a slide-out drawer
      matching the size/behavior conventions of `TaskDrawer.vue` (not a
      modal, not inline expansion in the settings list).
- [ ] The side panel presents the Cloudflare Tunnel setup/instructions
      content (per #68's `repoos tunnel setup` flow) needed to get a tunnel
      running, in enough detail that a user who has never touched
      `cloudflared` can follow it from the UI alone.
- [ ] The enabled/disabled state of the toggle persists (reflects and writes
      back to RepoOS config, consistent with how other Settings fields are
      persisted via `useConfigStore`).
- [ ] Toggling off disables/hides the feature's affordances in the UI
      (panel no longer auto-opens from Settings); it does not silently
      delete existing tunnel configuration.
- [ ] Existing Settings page behavior (General/Advanced groups, save flow,
      deep-link focus via `?focus=` query param) is unaffected.

## Notes for AI

- This task is UI-only: building the Settings toggle and the side panel
  shell/content. It depends on the underlying `repoos tunnel` CLI/config
  functionality from #68 (already `done`) to actually perform setup and
  manage tunnels — wire the panel's actions to that existing functionality
  rather than reimplementing tunnel logic in the UI layer.
- Reference `src/ui-app/src/views/SettingsView.vue` for the settings-row
  pattern (`setting-row`, `setting-label`, `setting-desc`, `Switch` from
  `components/ui/switch.vue`) and `src/ui-app/src/components/TaskDrawer.vue`
  + `useUiStore` (`ui.drawerWidth`, `ui.startResize`, open/close state) for
  the side-panel pattern to mirror for sizing/resize/open-close behavior.
- Assumption (not specified in the source explanation): the exact set of
  management actions exposed in the panel beyond initial setup instructions
  (e.g. creating a tunnel for a specific app, editing the email allowlist,
  viewing tunnel status) is left to the AI's judgment — at minimum, surface
  the setup instructions; fuller tunnel/app management can be included if it
  fits naturally, but is not a hard requirement of this task.
- Assumption: what happens to a running tunnel when the toggle is switched
  off (stop it vs. leave it running but hide the UI) is unspecified; default
  to leaving any already-running tunnel untouched and only controlling
  whether the UI surfaces/offers the feature, unless implementation reveals
  a clearer expectation.
- Do not build a generic/reusable "instructions panel" abstraction beyond
  what's needed here — follow the existing `TaskDrawer.vue` pattern directly.
- Do not implement new backend tunnel logic; this task is scoped to
  Settings + side panel UI wired to the existing `repoos tunnel` CLI/config
  surface from #68.

## Scope

In scope: Settings page toggle, side panel UI (setup instructions, wiring to
existing tunnel CLI/config), persistence of the enabled/disabled setting.

Deferred: any new Cloudflare Tunnel backend/CLI capability (covered by #68),
a generic reusable side-panel component abstraction, in-panel editing of
per-app Access allowlists unless it falls out naturally from the setup flow.

## Related

- #68 — Add Cloudflare Tunnel + Zero Trust publishing for local apps (backend
  this UI surfaces)

## Activity

- 2026-08-11T05:59:26Z · created · unknown
- 2026-08-11T08:17:14Z · status inbox→ready
- 2026-08-11T12:15:07Z · status ready→active, branch
- 2026-08-11T13:01:51Z · status active→ready
