---
id: "1154"
title: "Update/restart notice: don't suggest a launchd command for a hand-run server; offer a real restart and fix repoos restart auth (401)"
type: bug
status: active
priority: p2
area: [web, server, cli]
assigned_to: ai
created_by: t@t
branch: feat/update-restart-notice-don-t-suggest-a-la
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T13:30:27Z"
updated_at: "2026-11-17T15:40:38Z"
review_rounds: 1
review_passes: 1
---
## Problem

After a release installs, the 'RepoOS vX is installed' modal tells Nick: 'This server is not supervised. Copy the command and run it in a terminal' and shows `launchctl kickstart -k gui/$(id -u)/com.repoos.serve.repoos-c4114ede`. On Nick's Mac that launchd service does not exist (`launchctl print gui/501/com.repoos.serve.repoos-c4114ede` says 'Could not find service'); the server was started by hand with `just serve`. So the suggested command cannot work, and the modal has no Restart button, so Nick has no working way to apply the update from the UI.

Also `repoos restart` stopped with 'Could not confirm the server is idle: server returned HTTP 401' when run by an agent, so it did not restart anything.

## Desired UX

- The modal only shows a launchd/systemd command when that service really exists. Otherwise it says plainly what this server is (hand-run), and offers a working action.
- For a hand-run server the modal offers a **Restart now** button that restarts it safely: a helper process outside the server stops it once agents and checks are idle (or after the user confirms interrupting them) and starts it again with the same command and arguments it was launched with. If RepoOS cannot reliably relaunch itself, say so and show the exact command to run (for example `repoos restart`).
- `repoos restart` authenticates the same way other CLI commands do and works for a hand-run server.

## Acceptance criteria

- [ ] The modal never shows a launchctl or systemd command for a service that is not installed; a test covers hand-run, launchd-managed and systemd-managed servers.
- [ ] For a hand-run server the modal has a Restart now button (shared dialog components) that restarts the server and brings it back with the same launch command and port, and the page reconnects. It states how many agents and checks will be interrupted and that agents resume.
- [ ] `repoos restart` no longer fails with HTTP 401 for a normal logged-in user or an agent running on the same machine, and its refusal messages are specific.
- [ ] If a safe relaunch is impossible, the modal says why and shows one correct command.
- [ ] Docs (user-docs and the restart/#0214 notes) are updated, and #1091's managed-service restart behavior is unchanged.

## Notes for AI

Read #1075 (the restart notice) and #1091 (`repoos restart`). A server that kills itself with nothing to restart it stays down; the relaunch must be done by a detached helper that records the original argv and cwd. Do not touch task or worktree state.

## Shots
```json
[
{
"label": "Hand-run server restart notice",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"installed-restart-notice\"]",
"state": "release:restartPendingLight"
}
]
```

## Activity

- 2026-11-17T13:30:27Z · created · t@t
- 2026-11-17T14:36:07Z · cli_override, model_override
- 2026-11-17T14:36:08Z · status inbox→ready
- 2026-11-17T14:36:10Z · status ready→active, branch
- 2026-11-17T14:57:45Z · body
- 2026-11-17T15:00:38Z · CTO nudge: held — handoff gate is running
- 2026-11-17T15:02:12Z · note: ui verification passed: 1 shot captured with clean console (1 shot warning)
- 2026-11-17T15:02:13Z · status active→review
- 2026-11-17T15:02:14Z · message_queued at 2026-11-17T15:02:14.283Z
- 2026-11-17T15:06:52Z · note: review pass 1: needs some work
- 2026-11-17T15:06:52Z · message_delivered: 1 message(s)
- 2026-11-17T15:06:52Z · status review→active
- 2026-11-17T15:11:00Z · body
- 2026-11-17T15:38:16Z · body
- 2026-11-17T15:40:38Z · CTO nudge: held — handoff gate is running
