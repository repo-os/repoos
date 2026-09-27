---
name: RepoOS Hub for Linux / Arch
number: "0004"
created_at: "2026-09-27T08:14:23.446Z"
created_by: hello@repoos.org
---
# RepoOS Hub for Linux / Arch

Initial native Linux desktop companion for RepoOS, targeting Arch Linux / Omarchy first. Same core value as the macOS Hub: one desktop workspace for multiple local and remote RepoOS servers, with persistent sidebar, isolated embedded server sessions, health status, and local-service controls.

## Scope

- Native Qt 6 + QML shell; each RepoOS server hosted in Qt WebEngine. Do not reimplement the RepoOS web UI natively.
- Companion to the RepoOS CLI/server, not a replacement. First-run and empty-state UX must make this explicit: remote servers connect immediately with no local install; local servers require RepoOS installed and running. Never imply Hub installs or replaces RepoOS.
- Target Arch / Omarchy with Wayland/Hyprland as primary. Package for the Arch ecosystem first: AUR/PKGBUILD path, `.desktop` launcher, icon, Wayland support, normal system-package updates.
- Server registry persisted locally: add, edit, remove, select, group/pin, preserve metadata.
- Embedded workspaces with per-server isolated web profiles (isolated storage per server), safe same-origin navigation policy, back/forward/reload, loading states, useful errors.
- Health checks with sidebar status/attention indicators for local and remote servers.
- Safe local-service controls (start/stop/restart, progress, bounded readiness polling, auto-load only when healthy, failure/log guidance) restricted to previously verified loopback servers using explicit Linux mechanisms (`systemd --user` / existing repoos service support). Never manage remote machines; remote entries never expose local process controls.
- Linux desktop integration: notifications, app identity, icons, `.desktop` entry, Wayland/Hyprland behavior.
- Arch packaging + release automation: versioned PKGBUILD/AUR-ready artifacts, checksums, install/upgrade/uninstall docs, CI validation.
- Tests at the right layers: registry migration/persistence, origin/navigation policy, health-state transitions, service-control eligibility and timeouts, package/build smoke, plus a manual Omarchy acceptance checklist.
- Docs updates: user docs, landing/download guidance, release docs, and internal RepoOS docs covering scope, install, architecture, and release process.

Suggested build order: architecture/security design → Qt/QML scaffold + Arch build workflow + minimal Wayland window → registry → embedded workspaces → health/sidebar → local-service controls → first-run/empty-state → desktop integration → packaging/release automation → automated tests + Omarchy checklist → docs.

## Outcomes

- An Omarchy/Arch user can install via the documented Arch path, launch from the app launcher, add local and remote servers, and switch between them reliably.
- A verified local server started through Hub opens automatically only after healthy.
- Implementation is tested, documented, and release automation is reproducible.

## Non-goals

- Flatpak, other distributions, broad generic-Linux support, Windows, or mobile within this story.
- Native reimplementation of the RepoOS web UI.
- Remote process management or any implicit/unsafe service control.

## Open questions

- Exact `systemd --user` unit shape and interaction with existing `repoos` service support — settled in the architecture task.
- Registry storage location/format and migration story on first Hub version.
- Qt WebEngine profile isolation details and origin/navigation allowlist.
- AUR publish vs. local PKGBUILD-only for v1, and versioning/checksum flow.
