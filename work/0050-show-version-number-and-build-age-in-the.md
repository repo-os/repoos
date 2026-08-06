---
id: "0050"
title: Show version number and build age in the UI's lower-left corner
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/show-version-number-and-build-age-in-the
created_at: "2026-08-06T17:25:52Z"
updated_at: "2026-08-06T17:37:07Z"
---
## Problem

The RepoOS web UI changes frequently, but nothing in the running app tells the
user how new it is. There is no visible version number and no signal of when
the currently-served UI was last updated, so a user can't tell whether what
they're looking at is current or stale — e.g. whether a change they just made
to the source is actually reflected in what `repoos serve` shows.

## Desired UX

A small, unobtrusive widget fixed in the **lower-left corner** of the web UI
that always shows:

- The app version number (e.g. `v0.3.0`).
- How long ago the UI was last updated, as a human-relative age — e.g. "just
  now", "10 seconds ago", "3 minutes ago", "48 hours ago".

The age ticks over so it always reads correctly without a page reload, and the
widget fits the existing theme (works in both light and dark).

## Acceptance criteria

- [ ] Version number visible in the lower-left corner of the desktop UI (e.g. bottom of the left sidebar).
- [ ] Human-relative age of the current build shown next to the version (formats like "just now", "10 seconds ago", "3 minutes ago", "48 hours ago").
- [ ] Age updates in real time (recomputes on an interval) without a page reload.
- [ ] Build timestamp is captured at build time and served to the UI — not hardcoded.
- [ ] Renders correctly in both light and dark themes.
- [ ] Zero new runtime dependencies.
- [ ] Graceful fallback when build info is unavailable (shows the version only, or "unknown" for age).
- [ ] `repoos check` passes (build, typecheck, tests, UI smoke test) before the task moves to review.

## Notes for AI

- Interpretation used here: "version" = the `version` field in `package.json`
  (currently `0.3.0`); "when it was last updated" = the timestamp of the last
  build of the UI/`dist/` output — i.e. how old the currently-served UI is.
- Where the age comes from: the build pipeline (`scripts/copy-assets.mjs`)
  already writes `dist/.build-info.json` for staleness detection — extend it to
  also record a build timestamp. The server (e.g. `GET /api/health` or a new
  small endpoint) should expose version + build time; the Vue app fetches it
  and renders the widget. Do NOT hardcode the timestamp into the UI.
- The relative-age helper and the widget's live tick can be implemented in the
  UI itself (a small `setInterval`); no runtime dependency is allowed.
- Widget placement: bottom of `src/ui-app/src/components/Sidebar.vue` is the
  natural lower-left slot in the `App.vue` layout (TopBar top, Sidebar left,
  content right). The widget is additive — don't disturb the sidebar's existing
  structure.
- Mobile: the sidebar is hidden on small screens; a mobile fallback (e.g. in
  `MobileTabs.vue`) is in scope only if it doesn't complicate the primary
  desktop requirement — state clearly what you did.
- After any UI change, rebuild (`bun run build`) and keep a `repoos serve`
  running so the change can be viewed; verify with a browser probe before
  reporting done. Remember the UI is served from `dist/` — a stale build will
  silently show the old UI.
- Run `repoos check` and confirm it passes before moving the task to review.

## Scope

- Covers: surfacing the version + build age in the web UI, capturing the build
  timestamp at build time, and serving it to the UI.
- Defers: changes to the CLI's `version` output, build-freshness warnings, or
  the build pipeline's semantics beyond adding the timestamp.

## Related

- `dist/.build-info.json` staleness guardrail — task #0012
- `scripts/copy-assets.mjs` (writes the build marker)

## Activity

- 2026-08-06T17:25:52Z · created · unknown
- 2026-08-06T17:26:29Z · status inbox→ready
- 2026-08-06T17:26:30Z · status ready→active, branch
- 2026-08-06T17:37:07Z · status active→review
