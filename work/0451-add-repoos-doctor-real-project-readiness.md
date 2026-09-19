---
id: "0451"
title: Add repoos doctor real-project readiness preflight
type: feature
status: ready
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: ""
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
review_model_override: openrouter/xiaomi/mimo-v2.5
created_at: "2026-09-19T16:42:56Z"
updated_at: "2026-09-19T22:35:34Z"
---
## Outcome

Give someone adopting RepoOS in a real repository one deterministic, non-destructive preflight that answers: is this project ready to initialize, run, and hand work to an agent; if not, what exact action fixes it?

## Desired UX

`repoos doctor` runs locally against the current project and produces a compact pass/warn/fail report with actionable remediation. It must be useful before the first task and when an existing setup is behaving unexpectedly.

`repoos doctor --json` returns the same classified findings for the UI, scripts, and a future support bundle. It must never contact an AI/model provider or consume tokens merely to inspect readiness.

## Checks

- [ ] Repository identity: project root, Git availability/state, linked-worktree context, and whether the resolved root is safe for RepoOS operations.
- [ ] RepoOS configuration: parse and validate repoos.toml, report unsupported/invalid values without exposing secret values, and identify the effective configured layout/directories.
- [ ] Filesystem and layout: required directories can be created/read, configured task/docs/worktree locations resolve within allowed boundaries, and existing RepoOS task files have valid frontmatter.
- [ ] Runtime prerequisites: detect required core executables plus configured agent CLIs, package managers, and the tools declared by the project check plan. Missing required tools are failures with install-oriented guidance; optional integrations are warnings.
- [ ] Project gate: explain whether a meaningful required `repoos check` plan is configured. Integrate with #0446 rather than preserving a hidden Bun-specific assumption.
- [ ] Local lifecycle: identify a reachable RepoOS server for this project when one is expected, distinguish a stale status record from an actual listener where possible, and avoid modifying or killing processes.
- [ ] Secrets/auth: report only whether configured integrations appear to have the required credential variables, never their names when that itself is sensitive, never their values, and never write them into logs.
- [ ] Output uses stable finding IDs, severity, plain-language explanation, and a concrete next command or UI location.

## Safety and scope

- Strictly read-only by default: no init, config rewrite, login, package install, API request, process termination, task dispatch, or git mutation.
- Do not require a network connection. If a later optional network check is added, it must be explicitly opted into and clearly labelled.
- A problem in one optional agent/provider must not make the whole project look unusable.
- Add fixtures and unit/integration coverage for clean projects, malformed configuration, missing runtimes, nested layouts, existing repositories, and linked worktrees.

## Acceptance criteria

- A new user can paste the output into an issue and an experienced user can identify the next repair without reading source.
- The UI can render the JSON findings without duplicating the diagnostic logic.
- A healthy RepoOS project passes without warnings caused solely by unconfigured optional integrations.
- `repoos check` passes.

## Dependencies

Coordinate with #0446 (stack-neutral declarative check plan) and #0447 (init check-plan setup/UI). Doctor may land a minimal check-plan awareness first, but must not duplicate their execution/detection logic.

## Original prompt

P1 — Add `repoos doctor`: a real-project readiness preflight.

## Activity

- 2026-09-19T16:42:56Z · created · unknown
- 2026-09-19T17:16:25Z · status inbox→ready
- 2026-09-19T17:16:35Z · cli_override, model_override
- 2026-09-19T17:16:36Z · model_override
- 2026-09-19T22:35:24Z · cli_override, model_override
- 2026-09-19T22:35:28Z · model_override
- 2026-09-19T22:35:34Z · review_model_override
