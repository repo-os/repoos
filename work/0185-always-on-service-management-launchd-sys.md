---
id: "0185"
title: Per-repo background service management (launchd/systemd)
type: feature
status: inbox
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-14T04:16:57Z"
updated_at: "2026-09-17T11:40:39Z"
---
## Problem

A background RepoOS server is useful for a project used every day, but it must never turn into a collection of mysterious services. A person may use RepoOS in several repositories and want only some of them to survive a terminal close, reboot, sleep, or crash. Today that requires hand-writing a macOS LaunchAgent or Linux systemd user unit, gives no central inventory of what is running, and makes it too easy to leave an unwanted process behind.

The existing reload handoff also matters. RepoOS replaces its serving process after a successful rebuild. A persistent-service design must preserve that handoff and still detect a server that has stopped responding.

## Product decision

Background mode is explicit, per repository, and off by default. Normal repoos serve remains the simple foreground mode and stops with Ctrl-C. RepoOS must never enable a service during install or repoos init without a deliberate user action.

## Desired UX

- The Settings page for a repository has a Run this repo in the background control. Its state is Running, Stopped, Disabled, or Needs attention, not a vague on or off preference.
- Enabling affects only the current repository. Each managed service has a collision-safe repository-specific identifier; enabling one project cannot replace another project service.
- The UI shows the project path, URL or port, platform service type, auto-start status, latest health check, and a useful failure reason when unhealthy.
- The UI provides Start, Stop, Restart, Enable at login, Disable at login, and Remove service actions. Remove service stops it and deletes its OS service files.
- RepoOS exposes a CLI escape hatch for use when the UI is unavailable:

    repoos service list
    repoos service status
    repoos service start
    repoos service stop
    repoos service restart
    repoos service enable
    repoos service disable
    repoos service remove

  The commands without a repository selector operate on the current repo. repoos service list works from any checkout and inventories every RepoOS-managed service for the current user, including project path, port, auto-start state, and health.
- A first-run experience may explain that background mode exists and can be enabled later, but must not prompt in a way that implies it is required or turn it on by default.
- Any health watchdog exists only while this visible managed-service mode is enabled and is presented as part of that service bundle, never as an unexplained second daemon.

## Platform behavior

- macOS uses a user LaunchAgent, with RunAtLoad and KeepAlive behavior appropriate to the reload handoff, ProcessType=Background, logs in a predictable RepoOS-owned location, and AbandonProcessGroup=true where required for the handoff.
- Linux uses a systemd user unit and, where needed, a timer or equivalent health check. RepoOS must never run as root or create a system-wide unit.
- If a Linux user wants the service to survive logout, explain the effect of loginctl enable-linger and require an explicit confirmation. Never enable linger automatically.
- The service starts an installed, built RepoOS command rather than source files. Source-checkout behavior may be supported deliberately for development, but it must not accidentally become the normal managed-service target.

## Acceptance criteria

- [ ] A fresh RepoOS install and repoos init create no background service and require no service-management setup.
- [ ] Enabling background mode from one repository creates and starts exactly one collision-safe user-level service for that repository; it does not affect any other RepoOS repository.
- [ ] The Settings page reports actual OS service and health state, including drift when a unit was removed or stopped outside RepoOS.
- [ ] Start, Stop, Restart, Enable at login, Disable at login, and Remove service work from the UI. Remove stops the service and removes every RepoOS-managed OS artifact for that repository.
- [ ] repoos service list accurately inventories every managed RepoOS service from any checkout, so users can find and turn off services they no longer want.
- [ ] repoos service status, start, stop, restart, enable, disable, and remove work for the current repository without requiring the web UI.
- [ ] macOS preserves at least one real reload handoff and recovers an unhealthy server without leaving an invisible orphan process.
- [ ] Linux uses a systemd user unit and gives explicit, non-automatic guidance for login linger.
- [ ] The feature does not expose secrets, use root privileges, or add a surprise persistent process outside explicit per-repo enablement.
- [ ] repoos check passes.

## Notes for AI

- Read src/server/reload.ts in full before touching this. Its spawn-and-exit reload handoff is deliberate; solve supervision around it rather than changing it to fit a service manager.
- Do not use one fixed service filename for every repo. Design the repository identifier and registry before implementing platform-specific unit generation.
- Keep foreground repoos serve unchanged. Persistent service management is an opt-in layer, not a replacement for the normal development workflow.
- Treat service list and remove as first-class deliverables, not follow-up polish. They are the guardrail against background-service anxiety.
- A manually-created macOS reference LaunchAgent exists on this machine at ~/Library/LaunchAgents/com.repoos.serve.plist. It is useful reference material only; the shipped implementation must generate per-repo managed units.

## Activity

- 2026-08-14T04:16:57Z · created · unknown
- 2026-09-17T11:40:39Z · title, body
