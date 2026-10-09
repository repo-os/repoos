---
id: "0747"
title: "Dev targets: config and supervisor (start, stop, restart, status, logs)"
type: feature
status: active
priority: p1
area: [core, server]
story: "Dev page: start and manage dev targets"
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/dev-targets-config-and-supervisor-start-
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-09T17:10:37Z"
updated_at: "2026-10-09T17:40:33Z"
---
## Problem

RepoOS can show task previews, but a user has no way to run their own dev servers or builds from RepoOS. Starting an HMR server or a debug build still needs a terminal.

## Desired UX

Each project can declare dev targets in repoos.toml. The server can start, stop and restart a target in the project checkout, keep it running after the browser closes, and report its state and recent output. This task is the backend only; the Dev page and Settings UI come in later tasks.

## Acceptance criteria

- [ ] repoos.toml accepts `[[dev.targets]]` with name, kind (server | artifact), command, optional url, optional artifactPath, optional label, and optional healthCheck (url or file path). Unknown or invalid entries produce a clear validation error.
- [ ] The server exposes start, stop, restart and status for a target via the API, and the repoos CLI has matching commands.
- [ ] A started target survives the browser closing and stops only when asked or when the server stops.
- [ ] Status is one of running, stopped, starting, failed, with the failure reason and last ~200 output lines available.
- [ ] Only commands declared in the committed repoos.toml can be run. No request body can supply a command.
- [ ] Tests cover config validation, start/stop/restart, status transitions, and the rule that a bad command reports failed without crashing the server.
- [ ] Zero new runtime dependencies.

## Notes for AI

- Follow the existing `[[deployments]]` config parsing pattern and the way preview processes are supervised (see the preview and runner code); reuse rather than invent a second process model.
- The process runs in the project's root checkout, not a task worktree. Do not start it from a task worktree.
- Do not add a Settings control in this task; that is the Settings task in this story.
- Check that `repoos check` passes before handoff.

## Related

- Story: Dev page: start and manage dev targets

## Activity

- 2026-10-09T17:10:37Z · created · njachowski@gmail.com
- 2026-10-09T17:10:48Z · status inbox→ready
- 2026-10-09T17:10:50Z · status ready→active, branch
- 2026-10-09T17:29:21Z · body
- 2026-10-09T17:30:10Z · body
- 2026-10-09T17:31:22Z · body
- 2026-10-09T17:33:14Z · model_override
- 2026-10-09T17:38:33Z · body
- 2026-10-09T17:39:51Z · body
- 2026-10-09T17:40:33Z · body
