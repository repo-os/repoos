---
name: "Dev page: start and manage dev targets"
number: "0010"
created_at: "2026-10-09T17:10:27.334Z"
created_by: api
---
## Goal

Give every RepoOS user a Dev page that lists the things they run while developing — a local HMR web server, a debug APK or simulator build, a built preview — per project, and lets them start, stop and restart each one with a button, without opening a terminal. A running HMR server keeps running after the page is closed.

Dev targets are distinct from task previews. Task previews stay on the task view. The Dev page covers what the user starts for themselves.

## Scope

- A per-project `dev` target list in repoos.toml. Each target has a kind (server with a URL, or build artifact with an output path), a command, an optional label and branch or worktree, and a health check (URL answers, or file exists).
- A server-side supervisor that starts, stops and restarts a target in the project checkout, keeps the process alive independent of the browser, reports running/stopped/failed state, and keeps a tail of its output.
- The Dev page: per-project grouping, Start/Stop/Restart, state, last output lines, and the open-URL link for servers.
- A Settings control for the target list, per the repo rule that user-facing repoos.toml settings need one.

## Explicit non-goals

- No arbitrary commands typed in the UI. Only commands declared in the committed repoos.toml can run.
- Task previews are not changed.
- No remote or hosted dev environments.
