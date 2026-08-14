---
id: "0185"
title: Always-on service management (launchd/systemd) with settings toggle and onboarding prompt
type: feature
status: inbox
priority: p2
area: core
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-08-14T04:16:57Z"
updated_at: "2026-08-14T04:16:57Z"
---
## Activity

- 2026-08-14T04:16:57Z · created · unknown


## Problem

Most people running repoos want it always on — an install with no supervising
process just silently goes offline (crash, reboot, laptop sleep/wake) with no
recovery and no visible cause in the UI beyond "offline." Today nothing sets
this up: a user has to know to hand-write a macOS LaunchAgent (or, on Linux, a
systemd user unit) themselves, point it at the built `dist/cli/index.js`
(never `src/`, since `isDevBuild()` in `src/server/reload.ts` disables
auto-reload when running from source), and get the platform's process-group
semantics right. On macOS specifically, `repoos`'s own auto-reload
(`ReloadManager` in `src/server/reload.ts`) hands off to a freshly spawned
replacement process and exits the old one on a successful build — by default
launchd kills the whole process group when its tracked job exits, which would
kill the reload replacement mid-handoff unless `AbandonProcessGroup` is set.
Even with that set, the replacement is no longer the PID launchd is tracking,
so launchd's crash-supervision doesn't cover it until the next login/reboot or
a manual `launchctl kickstart -k`. In practice that unsupervised window opens
on the *first* ordinary auto-reload after each login (any task merging to
main triggers one), so most of a long session's uptime is actually running
without OS-level crash supervision — not an edge case.

## Desired UX

- A settings-page toggle: "Keep repoos running" (or similar), on by default
  for a fresh install, that installs/removes the appropriate OS service.
- macOS: writes a `~/Library/LaunchAgents/com.repoos.serve.plist`
  (`RunAtLoad` + `KeepAlive` on crash, `ProcessType=Background`, stdout/stderr
  to a log file, `AbandonProcessGroup=true` for the reload-handoff reason
  above) and loads it via `launchctl bootstrap`/`bootout`.
- Linux: writes a systemd **user** unit (`~/.config/systemd/user/repoos.service`,
  `WantedBy=default.target`, `Restart=on-failure`) and manages it via
  `systemctl --user enable/start/stop/disable`. Needs `loginctl enable-linger
  <user>` (or equivalent guidance) if repoos should survive logout, since
  user units otherwise stop when the session ends — surface that as a note
  or a second toggle, don't silently assume it.
- A **watchdog** companion (separate small scheduled job, not part of the
  main service unit) that periodically hits `/api/health` and restarts the
  service if unreachable. This is what actually closes the post-reload
  supervision gap described in Problem — it doesn't care which PID is
  currently serving, only whether something is listening. On macOS this is a
  second LaunchAgent with `StartInterval`; on Linux, a systemd timer unit or
  `Restart=` won't cover it alone since the service's tracked PID also
  changes on reload — needs the same "PID-agnostic health poll" approach.
- First-run / `repoos init` prompt: ask whether to enable "always running"
  and set it up there, rather than expecting users to find it in settings
  after the fact.
- Detect and reconcile: if the toggle is checked but the service file is
  missing (e.g. user deleted it manually, or migrated machines), the
  settings page should show that drift rather than just displaying a stale
  "on" toggle.

## Acceptance criteria

- [ ] macOS: settings toggle installs/removes a working LaunchAgent pointed
      at the built `dist/cli/index.js` (not `src/`), with `AbandonProcessGroup`
      set so the reload handoff survives.
- [ ] macOS: a health-poll watchdog restarts the service if the tracked
      process (original or a post-reload replacement) stops responding.
- [ ] Linux: settings toggle installs/removes a systemd user unit with
      equivalent behavior, including guidance/handling for session-linger.
- [ ] `repoos init` (or first run) offers to enable this, rather than it
      being opt-in-and-undiscoverable.
- [ ] Settings page reflects actual on-disk/service state, not just a
      persisted preference bit — detects drift if the service was removed
      out-of-band.
- [ ] Works correctly through at least one real auto-reload cycle on both
      platforms (i.e. verify the replacement process is not killed and stays
      supervised end-to-end, not just that the initial process starts).

## Notes for AI

- Read `src/server/reload.ts` in full before touching anything here — its
  process-handoff design has already been hardened through specific past
  incidents (referenced in its comments as #0096, #0143). Do not change its
  process model (spawn-and-exit) to work around the launchd/systemd
  supervision gap; solve it externally (the watchdog approach), since
  reload.ts's current design is deliberate and tested.
- The default `repoos serve` port is 7171 (`src/commands/serve.ts`); don't
  hardcode a different one from the dev preview config
  (`.claude/launch.json` uses 8765, that's unrelated — it's this repo's own
  dev-loop preview, not the shipped product's default).
- A manually-created reference LaunchAgent already exists on this machine at
  `~/Library/LaunchAgents/com.repoos.serve.plist` (not tracked in-repo) as a
  working example of the plist shape, including the `AbandonProcessGroup`
  key and its rationale — useful as a starting point but should become
  generated/managed by repoos itself rather than hand-maintained.
- Consider whether the "watchdog" should itself be a tiny standalone
  script/binary repoos ships, versus asking users to trust a second
  always-running thing — simplicity here matters more than cleverness.
