---
id: "0916"
title: Pausing an agent model with a reason writes an inline table that RepoOS's own TOML validator rejects (breaks toml-validate and release gates)
type: feature
status: active
priority: p1
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/pausing-an-agent-model-with-a-reason-wri
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T03:36:47Z"
updated_at: "2026-10-22T12:10:18Z"
---
## Problem
2026-10-22: pausing opencode-go models from the CLI with --reason (repoos agents pause opencode --model <m> --reason ...) wrote this into repoos.toml: pausedModels = [{ model = "...", pausedReason = "..." }, ...]. RepoOS's own TOML subset parser and validateToml reject inline tables ('inline tables aren't supported', line 735), so tests/toml-validate.test.ts 'accepts the repository's own repoos.toml' failed and the release gate (which validates on a remote runner, committed files only) failed with 'fix the invalid TOML on the release branch'. The same write path is used by the Agents page Pause dialog (per-model reason/date), so the UI can produce an invalid config too. The server kept running, so nothing flagged the broken file until a release.

## Desired UX
Any config write RepoOS makes is parseable by RepoOS's own parser and passes validateToml. Per-model pause with a reason or resume date is stored in a supported form.

## Acceptance criteria
- Round-trip test: for every writer that can emit repoos.toml (agents pause/resume with and without reason/until, model-level and agent-level, budget allowlist edits, settings saves), the output passes validateToml and re-parses to the same values.
- Per-model reason/resume date use [[budget.allowlist]] sub-array-of-tables or another form the parser supports (or the parser/validator gain inline-table support for this one shape), with a migration/read-compat test for files that already contain the inline form.
- A config write that would produce invalid TOML is refused with a clear error and leaves the file unchanged.
- The release gate's validateToml failure names the offending line and key.

## Notes for AI
Look at the pause writer behind repoos agents pause and the Agents page Budget Controls Pause dialog (#0850), src/core/toml-validate.ts and the budget.allowlist schema in src/core/config.ts. Workaround applied by hand on 2026-10-22: pausedModels = ["a", "b"] plus an agent-level pausedReason.

## Activity

- 2026-10-22T03:36:47Z · created · njachowski@gmail.com
- 2026-10-22T05:03:37Z · status inbox→ready
- 2026-10-22T12:00:22Z · cli_override, model_override
- 2026-10-22T12:00:24Z · status ready→active, branch
- 2026-10-22T12:03:21Z · body
- 2026-10-22T12:05:53Z · body
- 2026-10-22T12:08:31Z · body
- 2026-10-22T12:10:18Z · body
