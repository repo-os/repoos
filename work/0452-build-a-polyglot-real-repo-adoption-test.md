---
updated_at: "2026-09-19T23:31:09Z"
review_passes: 1
id: "0452"
title: Build a polyglot real-repo adoption test matrix
type: feature
status: review
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/build-a-polyglot-real-repo-adoption-test
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
review_model_override: openrouter/xiaomi/mimo-v2.5
created_at: "2026-09-19T16:43:21Z"
handoff_signal_retry_count: 1
---
## Outcome

Make RepoOS adoption behavior repeatable across the kinds of repositories real CTOs and technical builders actually bring: not only RepoOS itself and Bun/TypeScript, but backend, mobile, systems, and mixed-stack projects.

## Problem

A single self-hosting repository cannot prove that `repoos init`, configuration, checks, worktrees, and onboarding assumptions work in unfamiliar projects. Regressions currently risk being found first by a friend or customer.

## Matrix

Create maintained, minimal, synthetic fixture projects and a CI-visible matrix covering at least:

- [ ] TypeScript/web project (Node or Bun).
- [ ] Go backend/service.
- [ ] Rust/Cargo project.
- [ ] Android/Kotlin/Gradle project.
- [ ] Vue or similar frontend plus Go backend mixed repository.
- [ ] A repository that already contains its own AGENTS.md and ordinary project documentation.
- [ ] New/empty repository and an existing Git repository paths.

Fixtures must contain no proprietary code, credentials, remote infrastructure, or dependency on a live model provider.

## Scenarios

For each relevant fixture, exercise the supported lifecycle without hand-waving stack-specific details:

- [ ] Discover/init using the default namespaced RepoOS layout and a reviewed alternate/root layout where supported.
- [ ] Preserve existing AGENTS.md and project files; never silently overwrite user instructions.
- [ ] Validate generated repoos.toml/docs/task layout and deterministic noninteractive operation where CLI coverage needs it.
- [ ] Verify configured check-plan behavior and missing-tool diagnostics, not merely that a command exits green. Reuse #0446 test plan/fixtures rather than creating a competing schema.
- [ ] Exercise a task/worktree lifecycle far enough to catch path, Git root, and generated-file assumptions without requiring an AI run.
- [ ] Run `repoos doctor` when #0451 lands and assert expected clean/warn/fail categories.

## Test design

- Separate fast hermetic tests from toolchain-backed integration tests. The default local test suite must remain practical; heavier Gradle/Android or multi-tool jobs may be scheduled/CI-labelled with clear prerequisites.
- Pin fixture intent and expected capabilities in a machine-readable manifest so adding a stack or changing an assumption is reviewable.
- CI output must identify the fixture and lifecycle phase that failed, with a retained redacted diagnostic artifact where safe.
- Test macOS and Linux-specific path/process/package-manager behavior where the project supports both; avoid claiming Windows support unless it is actually covered.

## Acceptance criteria

- A regression in repo-root detection, layout selection, AGENTS preservation, config parsing, check plan selection, or worktree placement is attributable to a named fixture/scenario.
- The matrix produces actionable failures rather than a generic integration-test failure.
- Fixture maintenance does not require paid model credentials or external deployments.
- User-facing docs only promise stacks and flows covered by this matrix.
- `repoos check` passes.

## Dependencies

Build on #0446 for check execution, #0447 for check-plan setup, and #0451 for the doctor contract. Do not block the initial small fixture harness on every UI enhancement; stage the matrix deliberately.

## Original prompt

P1 — Build a polyglot real-repo adoption test matrix.

## Activity

- 2026-09-19T16:43:21Z · created · unknown
- 2026-09-19T22:15:02Z · status inbox→ready
- 2026-09-19T22:35:46Z · cli_override, model_override
- 2026-09-19T22:35:50Z · model_override
- 2026-09-19T22:35:58Z · review_model_override
- 2026-09-19T23:08:42Z · status ready→active, branch
- 2026-09-19T23:28:58Z · status active→review

