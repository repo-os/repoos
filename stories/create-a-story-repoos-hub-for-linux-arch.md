---
name: "Create a story: “RepoOS Hub for Linux / Arch”."
number: "0004"
created_at: "2026-09-27T08:14:23.446Z"
created_by: hello@repoos.org
---
Create a story: “RepoOS Hub for Linux / Arch”.
Goal: deliver an initial native Linux desktop version of RepoOS Hub for Arch Linux and Omarchy users. It should provide the same core value as the macOS Hub: one desktop workspace for multiple local and remote RepoOS servers, with a persistent sidebar, isolated embedded server sessions, server health status, and local-service controls.
Product direction:
- Target Arch Linux / Omarchy first, with Wayland/Hyprland as the primary desktop environment.
- Use Qt 6 + QML for the native shell and Qt WebEngine to host each RepoOS server UI. Do not reimplement the RepoOS web UI natively.
- Keep the app a companion to the RepoOS CLI/server, not a replacement for it.
- Remote servers must work without a local RepoOS install.
- Local service controls must use safe, explicit Linux mechanisms (systemd --user / existing repoos service support), never attempt to manage remote machines.
- Package for the Arch ecosystem first: an AUR/PKGBUILD install path, .desktop launcher, icon, Wayland support, and normal system-package updates. Flatpak and other distributions are explicitly out of scope for this first story.
Break the story into focused tasks, roughly in this order:
1. Write the Linux Hub architecture and security design: server registry, isolated embedded-browser storage per server, navigation/origin policy, local-vs-remote trust boundary, systemd user-service integration, packaging approach, and acceptance plan.
2. Scaffold the Qt/QML application with a reproducible Arch development/build workflow and a minimal window that launches on Wayland.
3. Implement persistent server registry: add, edit, remove, select, group/pin, and preserve server metadata locally.
4. Implement embedded server workspaces with per-server web profiles, safe same-origin navigation, back/forward/reload, loading states, and useful errors.
5. Implement server health checks and sidebar status/attention indicators for local and remote servers.
6. Add safe local-service controls for previously verified loopback servers: start, stop, restart, visible progress, bounded readiness polling, automatic page load when healthy, useful failure/log guidance, and no remote execution.
7. Add first-run and empty-state UX that makes the CLI relationship clear: Hub can connect to remote servers immediately; local servers require RepoOS to be installed and running. Do not imply Hub installs or replaces RepoOS.
8. Add Linux desktop integration: notifications, application identity, icons, .desktop entry, and Wayland/Hyprland behavior.
9. Create Arch packaging and release automation: PKGBUILD/AUR-ready artifacts, versioning, checksums, install/upgrade/uninstall documentation, and CI validation.
10. Add automated tests at the appropriate layers: registry migration/persistence, origin/navigation policy, health-state transitions, service-control eligibility and timeout behavior, package/build smoke tests, plus a manual Omarchy acceptance checklist.
11. Update user docs, landing/download guidance, release docs, and internal RepoOS docs so humans and future agents understand the Linux Hub’s scope, installation, architecture, and release process.
Definition of done for the story:
- An Omarchy/Arch user can install RepoOS Hub through the documented Arch path, launch it from their app launcher, add local and remote servers, and switch between them reliably.
- A previously verified local server can be started through Hub and opens automatically only after it is healthy.
- Remote entries never expose local process controls.
- The implementation is tested, documented, and release automation is reproducible.
- Do not begin broad Linux, Flatpak, Windows, or mobile support within this story.
