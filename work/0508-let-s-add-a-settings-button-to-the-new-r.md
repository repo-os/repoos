---
id: "0508"
title: Add a top-level settings panel to RepoOS Hub for Mac
type: feature
status: active
priority: p2
area: macos
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-a-top-level-settings-panel-to-repoos
cli_override: opencode
model_override: opencode/muse-spark-1.3-contributor-free
review_model_override: opencode-go/space-bunny-free
created_at: "2026-09-26T02:35:59Z"
updated_at: "2026-09-26T02:46:06Z"
---
## Problem

RepoOS Hub for Mac has no single place for settings that belong to the **app
itself**. Today the only app-level settings are two global notification toggles
buried in the standard `Settings` scene (⌘,), reachable only by knowing the
menu item; the Hub follows the system appearance with no user override; and
there is no in-app way to find out whether a newer Hub exists — the docs tell
you to go to the GitHub releases page and re-download the DMG by hand.

Settings that are genuinely per-server (attention, capability tokens,
cross-server search) already exist in the server context menu and should stay
there. What's missing is the complementary layer: app-wide preferences, in one
discoverable place, including appearance and updates.

## Desired UX

- A **`…` (vertical ellipsis) button sits at the top right of the Hub window**,
  in the native toolbar next to the back/forward/reload controls, styled like
  Chrome's three-dot menu button. Hovering it explains itself ("RepoOS Hub
  settings"), and it has a proper accessibility label.
- Clicking it opens **one settings window for the Hub app**, with sections:
  - **Appearance** — `System` / `Light` / `Dark`. Choosing one restyles the
    native shell immediately (sidebar, workspace chrome, sheets, popovers,
    ⌘K palette) with no relaunch, and it is remembered next launch. It does
    **not** touch the embedded RepoOS web UIs, which keep whatever theme each
    server's own web settings use.
  - **Check for updates** — shows the installed version, and a button that
    checks GitHub for a newer Hub. It reports one of three honest outcomes:
    up to date, a specific newer version is available, or the check could not
    complete. When an update exists it offers the download / releases link.
  - **Notifications** — the existing global **Native notifications** and **Dock
    badge total** toggles, moved here so the app has exactly one settings
    surface (per-server settings stay where they are).
  - **About** — the app version and build.
- `⌘,` opens the same window, so the standard macOS habit keeps working.

## Acceptance criteria

**Entry point**

- [ ] A `…` toolbar button is placed at the window's top-right (trailing)
      placement, at app level — not inside any server's embedded web content.
- [ ] It carries a `.help(...)` tooltip and a descriptive accessibility label
      (e.g. "RepoOS Hub settings").
- [ ] Activating it opens the Hub's settings window; `⌘,` opens the same
      window. No second, competing app-level settings surface is left behind.
- [ ] It works on the declared **macOS 13** deployment target — any macOS 14+
      only API (e.g. `SettingsLink` / `openSettings`) is guarded with a
      macOS 13 fallback.
- [ ] The button is keyboard reachable (focusable, with a visible focus ring)
      and the settings window is reachable without a pointer via `⌘,`.

**Appearance (Hub shell theme)**

- [ ] The Appearance section offers `System`, `Light`, and `Dark`; the default
      is `System`, so existing users see no change.
- [ ] Changing it applies immediately, without a relaunch, to the sidebar,
      workspace chrome, sheets, popovers, alerts, and the ⌘K palette.
- [ ] The choice persists across relaunch and survives an app update — stored
      in `~/Library/Application Support/RepoOS Hub/` alongside the other Hub
      preferences, via the existing document/`decodeIfPresent` pattern.
- [ ] A registry file written before this change still loads, defaulting the
      missing appearance value to `System`.
- [ ] The Dock icon variant follows the chosen appearance, including when the
      system appearance differs from it.
- [ ] Appearance affects **only** the native Hub shell. Per-server web themes
      are untouched: no theme is injected, forced, or bridged into any
      `WKWebView`, and the per-server web UI keeps its own theme setting.

**Check for updates**

- [ ] The About / updates area shows the running version
      (`CFBundleShortVersionString`) and build (`CFBundleVersion`).
- [ ] "Check for Updates" queries the GitHub latest-release endpoint and
      compares versions **numerically** (`1.10.0` > `1.9.0`), not lexically.
- [ ] Results are distinct and truthful: "You're up to date", "Version X.Y.Z
      is available", and "Could not check" for network, rate-limit, or
      malformed-response failures. A failed check never reports an update.
- [ ] Only the latest **stable** release is offered — prereleases are not
      suggested, matching the documented release contract.
- [ ] The check is **on demand only**: no network request at app launch, at
      window open, or on a timer. The last result is cached locally (reuse the
      six-hour convention already used for update checks in the web UI) and an
      explicit re-check refreshes it.
- [ ] The check is advisory only: it never downloads, installs, or replaces the
      app, and it adds no third-party update dependency. An available update
      offers a link that opens the releases page / DMG download in the default
      browser.
- [ ] The check is non-blocking and cannot crash or hang the UI on a timeout,
      `403` rate limit, or an HTML-instead-of-JSON response; failures surface
      as a normal, dismissible result.

**Consolidating the existing global settings**

- [ ] **Native notifications** and **Dock badge total** live in the same
      settings window, with unchanged labels, behavior, and defaults, still
      persisted through the existing `HubGlobalPreferences` store.
- [ ] Per-server settings are unchanged: the sidebar context menu's
      **Notifications…** sheet keeps its attention, capability, and
      cross-server-search controls, and the app-level panel neither duplicates
      nor overrides them.

**Tests and docs**

- [ ] Unit tests cover: version comparison, each update-result state
      (up-to-date / available / could-not-check), and appearance persistence
      plus the legacy-file default.
- [ ] Both `xcodebuild` commands in `macos/README.md` (build and test) pass.
- [ ] `user-docs/macos-hub.md` documents the new top-level settings entry
      point, the appearance preference, the in-app update check, and the
      relocated global notification toggles.
- [ ] No server or web-UI behavior changes; nothing outside `macos/` and docs
      is modified, so the normal RepoOS check plan still applies.

## Notes for AI

**Files to touch**

- `macos/RepoOSHub/RepoOSHubApp.swift` — the `Settings` scene content and any
  appearance plumbing; keep the existing `.commands` menu structure.
- `macos/RepoOSHub/ContentView.swift` — the new `…` toolbar entry point
  (currently the only toolbar is `HubWorkspaceToolbar`).
- `macos/RepoOSHub/HubAppState.swift` and `macos/RepoOSHub/ServerModels.swift` —
  the appearance preference on `HubGlobalPreferences` / the registry document,
  following the existing `decodeIfPresent ?? .default` decoding pattern.
- `macos/RepoOSHub/HubServerAttentionSettingsSheet.swift` — currently hosts
  `HubGlobalAttentionSettingsView`; that view's contents move into the new
  window (the per-server sheet stays).
- New file(s) for the settings window and the update check, mirroring the
  existing naming style (`Hub…`, one concern per file), plus
  `macos/RepoOSHubTests/` coverage.

**Constraints**

- The macOS target has **no third-party dependencies** — no Sparkle or any
  other update library. Use `URLSession` against the GitHub releases API the
  same way `src/server/routes/release.ts` / `src/commands/upgrade.ts` do.
- Deployment target is **macOS 13** (`MACOSX_DEPLOYMENT_TARGET = 13.0`);
  `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` come from the build
  settings, so read the version from the bundle, not from a hardcoded string.
- Persistence goes in the existing Application Support registry document; do
  not introduce a second preferences file or a new `UserDefaults` store for
  preferences that already have a home.
- Gate for this change is `xcodebuild build` + `xcodebuild test` (the root
  `repoos check` plan does not build the macOS target); CI runs the same two
  commands on Mac changes.

**Assumptions (stated, not asked)**

- "Toggle light/dark" is implemented as `System` / `Light` / `Dark` with
  `System` as the default — the macOS-idiomatic superset of a two-way toggle.
- The `…` button opens the settings window rather than a Chrome-style quick
  action menu; ⌘, targets the same window.
- "Check for updates" is check-and-link only, **not** an installer. The DMG is
  currently ad-hoc signed and not notarized (`docs/macos-hub-release.md`), so
  an in-app replace would hit a Gatekeeper warning; the button links out
  instead, and the copy must not imply signing or notarization.
- Theme preference applies to the native shell only, per the user's explicit
  "on the RepoOS mac app, not on the individual repoos servers".

**Do not**

- Do not add a theme setting to, or duplicate server settings into, the
  per-server **Notifications…** sheet.
- Do not add a JavaScript bridge or any injection into the embedded web views
  to force a theme.
- Do not add a runtime dependency to the macOS target, or touch the app name,
  bundle identifier, or release artifact contract.
- Do not add a background/periodic update check or an automatic download.

## Scope

In scope: the `…` entry point, a single app-level settings window, the
appearance preference, the on-demand update check with the About/version
readout, and relocation of the two existing global notification toggles.

Deferred: a Chrome-style quick-action menu (frequent actions, "refresh all
servers"), automatic background update checks, in-app download or install,
per-server appearance override, an independent Dock-icon theme choice, macOS
14-only settings styling, and localization.

## Related

- `docs/macos-hub-release.md` — release/artifact contract and the ad-hoc
  signing constraint behind the link-out update flow.
- `user-docs/macos-hub.md` — user-facing Hub doc, including the global
  Settings section being reorganized here.
- `macos/README.md` — build/test commands for the macOS target.
- `docs/adr/0006-macos-repoos-hub.md` — the Hub's scope and boundaries.
- `user-docs/agents.md` — precedent for on-demand, cached, advisory update
  checks in this product.
- Related task: #0508 (the original rough request).

## Original prompt

Let’s add a settings button to the new repoos mac app. from there you can have theme (for the macos app) to toggle light/dark. on the repoos mac app, not on the individual repoos servers. And any other settings that you think should be at the top level of the macos app (not individual server settings which already has it’s own settings). perhaps the settings button can go at the top right of the mac app (3 vertical dots like chrome). E.g. we could also have "check for updates" here and any other common settings you would recommend, or specific settings you think belong here for this app's use case.

## Screenshots

![Screenshot-2026-09-22-at-13.05.38](/api/tasks/0508/attachments/screenshot-1.png)

## Activity

- 2026-09-26T02:35:59Z · created · hello@repoos.org
- 2026-09-26T02:35:59Z · screenshots
- 2026-09-26T02:37:26Z · status draft→inbox, title, area, body
- 2026-09-26T02:39:22Z · status inbox→ready
- 2026-09-26T02:40:10Z · cli_override
- 2026-09-26T02:45:37Z · model_override
- 2026-09-26T02:46:02Z · review_model_override
- 2026-09-26T02:46:06Z · status ready→active, branch
