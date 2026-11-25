---
id: "1229"
title: Reconcile the repoos --help banner with per-command usage strings
type: chore
status: done
priority: p3
area: web
merged_commit: 5540f7f4665afcfd0237d442ff5705ea7c64e6a4
assigned_to: ai
created_by: t@t
branch: feat/reconcile-the-repoos-help-banner-with-pe
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-19T11:50:05Z"
updated_at: "2026-11-25T08:30:00Z"
last_close_out_gate_ms: 1140446
last_close_out_gate_at: "2026-11-23T17:39:12.753Z"
review_passes: 1
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
- 2026-11-23T16:43:52Z · status active→review
- 2026-11-23T16:43:52Z · message_queued at 2026-11-23T16:43:52.463Z
- 2026-11-23T16:43:52Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-23T16:44:29Z · note: review pass 1: good to go
- 2026-11-23T17:39:12Z · close-out gate completed in 1140s
- 2026-11-23T17:39:28Z · status done→done, release:success
- 2026-11-25T08:30:00Z · message_dropped: 1 queued message(s) discarded — task is done
