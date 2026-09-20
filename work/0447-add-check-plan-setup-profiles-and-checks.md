---
id: "0447"
title: "Add check-plan setup, profiles, and Checks visibility"
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/add-check-plan-setup-profiles-and-checks
created_at: "2026-09-19T15:10:16Z"
updated_at: "2026-09-20T00:50:41Z"
---
## Outcome

Make a project's check plan understandable and easy to bootstrap after the stack-neutral check engine exists.

## Scope

- During init, inspect only durable project signals such as package manifests, go.mod, Cargo.toml, Gradle files, Makefile, and justfile; propose a starter check plan for human review rather than silently enabling commands.
- Add a Checks surface in RepoOS that shows configured steps, profile membership, paths/cwd, last result, duration, command output, and clear reasons for skips or unavailable prerequisites.
- Support a default gate, a changed-path fast mode, and named slow profiles such as integration/release.
- Make cross-cutting steps explicit so changes spanning an Android client and TypeScript backend, or Vue frontend and Go backend, still run the right contract/integration check.

## Acceptance criteria

- Init can propose sensible but uncommitted plans for Node/Bun, Go, Rust, Gradle/Android, and mixed repositories.
- The user can review/edit the proposal before it becomes repoos.toml configuration.
- The UI never calls a missing tool a successful check; it shows the exact missing prerequisite and command.
- A user can tell from one screen what repoos check will run for the selected profile and why.
- This task depends on the declarative check-plan engine; do not duplicate its execution logic in the UI.

## Activity

- 2026-09-19T15:10:16Z · created · unknown
- 2026-09-20T00:49:29Z · status inbox→ready
- 2026-09-20T00:50:41Z · status ready→active, branch
