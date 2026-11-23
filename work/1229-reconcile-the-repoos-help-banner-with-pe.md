---
id: "1229"
title: Reconcile the repoos --help banner with per-command usage strings
type: chore
status: active
priority: p3
area: web
assigned_to: ai
created_by: t@t
branch: feat/reconcile-the-repoos-help-banner-with-pe
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-19T11:50:05Z"
updated_at: "2026-11-23T16:41:44Z"
---
## Problem
Several real flags and subcommands are missing from generated or printed usage text: `repoos check --fix/--step` and `repoos doctor --yes` exist in code but the banner omits them; the same class hit `repoos secrets bindings` (fixed in #1227). A user or agent trusting `--help` alone misses real capabilities.

## Desired UX
Every real flag and subcommand appears in both the self-help banner and each command's own usage/error line, and a test pins the pair so drift fails the gate.

## Acceptance criteria
- Audit every command's banner entry in `src/cli/help.ts` against its parser (e.g. `parseCheckArgs`, `src/commands/doctor.ts`) and per-command usage strings; add the missing flags (`check --fix/--step`, `doctor --yes`, any others found).
- Table-driven tests assert banner and error-usage coverage per command (pattern: `src/commands/secrets.test.ts`).

## Notes for AI
Sweep the whole `src/commands/` directory, not just the two known instances. Docs-only fix, no runtime dependency changes.

## Activity

- 2026-11-19T11:50:05Z · created · t@t
- 2026-11-23T11:53:45Z · status inbox→ready
- 2026-11-23T16:19:06Z · cli_override, model_override
- 2026-11-23T16:19:06Z · status ready→active, branch
- 2026-11-23T16:35:44Z · body
- 2026-11-23T16:41:44Z · body
