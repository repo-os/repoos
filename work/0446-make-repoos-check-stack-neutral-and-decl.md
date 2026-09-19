---
id: "0446"
title: Make repoos check stack-neutral and declarative
type: feature
status: review
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/make-repoos-check-stack-neutral-and-decl
cli_override: opencode
model_override: openrouter/tencent/hy4-preview
created_at: "2026-09-19T15:09:57Z"
updated_at: "2026-09-19T19:36:14Z"
review_rounds: 1
review_passes: 1
handoff_signal_retry_count: 1
---
## Outcome

Make repoos check a project-defined gate that works for JavaScript, Android/Gradle, Go, Rust, and mixed repositories without silently reporting a meaningless green result.

## Scope

- Add a versioned, committed check-plan schema in repoos.toml with named steps, command, cwd, timeout, required/optional behavior, profiles, and changed-path selection.
- Run declared steps with structured results (command, cwd, duration, output, skip/failure reason) and a single non-zero exit when required steps fail.
- A configured required step with a missing runtime/tool must fail with an install-oriented diagnostic; only explicitly optional/excluded steps may skip.
- Preserve RepoOS's current build, formatting, lint, test, smoke, asset, and RepoOS-specific guards through an explicit compatible plan/migration. Remove the unconditional Bun/package.json build assumption for other projects.
- Default safely: a project with no meaningful configured plan must not get an all-green definition-of-done result.
- Keep close-out using the full required profile against the merged candidate; changed-path execution is a fast pre-review mode, not the final merge gate.

## Acceptance criteria

- RepoOS's current repo remains green with equivalent coverage.
- A Go-only fixture, a Gradle/Android fixture, a Rust fixture, and a mixed web-plus-backend fixture each run only their declared commands.
- Command output distinguishes pass, explicit skip, missing prerequisite, timeout, and command failure.
- Existing check configuration (including uiSmoke) remains compatible or gets an actionable migration warning.
- Docs and CLI output explain the configured plan and selected profile.

## Activity

- 2026-09-19T15:09:57Z · created · unknown
- 2026-09-19T15:32:13Z · cli_override
- 2026-09-19T15:32:14Z · cli_override
- 2026-09-19T15:32:42Z · model_override
- 2026-09-19T15:32:49Z · status inbox→ready
- 2026-09-19T15:32:51Z · status ready→active, branch
- 2026-09-19T17:24:16Z · status active→review
- 2026-09-19T17:26:37Z · status review→active
- 2026-09-19T19:36:14Z · status active→review
