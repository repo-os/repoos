---
id: "1059"
title: "Check gate: skip the full suite when the diff is bookkeeping/docs only"
type: chore
status: active
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/check-gate-skip-the-full-suite-when-the-
cli_override: codex
model_override: gpt-6.1-terra
review_cli_override: codex
review_model_override: gpt-6-luna
created_at: "2026-11-08T02:53:59Z"
updated_at: "2026-11-08T06:26:19Z"
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-11-08T06:26:00.174Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Problem
`repoos check` runs the full plan (build, format/lint, full test suite, WebKit UI smoke, contrast audit) even when a task's diff contains only task bookkeeping under `work/` (task file, `work/reports/<id>/*`) or other non-code files. Example: #1055 (the weekly worktree cleanup) changed 11 files, all under `work/`, and still waited for a remote-validation slot and ran the full 680-file suite on every handoff attempt, repeating after each outage or capture timeout. That is minutes to hours of wasted time and runner load for a change that cannot affect behavior. The recurring weekly cleanup will hit this every run.

## Desired behavior
- When the diff against the base (the same `changed vs main` computation the scoped check already uses) touches ONLY paths that cannot affect build or behavior, the check runs only the cheap guards and skips build, tests, UI smoke, contrast audit and remote validation, and reports clearly "docs/bookkeeping-only diff: full suite skipped".
- "Cannot affect behavior" is a conservative allowlist: `work/**`, `docs/**`, `user-docs/**`, `inputs/**`, `*.md` at any depth, `schedules/**`. Anything else (src, scripts, package.json, lockfiles, repoos.toml, `.githooks`, config, assets, tests) forces the normal full path. If the changed-path list cannot be computed, fall back to the full path (fail closed).
- Guards that protect the repo still run in the skipped mode: format check on touched files that the formatter covers, the task-asset guard (no binaries under `work/` or `inputs/`), the lockfile/zero-runtime-dependency guard, and the task-file parser check (parser reads every file in `work/`).
- Close-out's gate behaves the same way for such diffs (it already scopes tests to changed paths); make sure a bookkeeping-only task does not trigger the full suite or remote validation there either.
- The allowlist and the skip are configured through `repoos.toml` `[[check.steps]]` / check settings per AGENTS.md ("change the gate by editing the plan in repoos.toml, not src/commands/check.ts"); if a Settings control is needed per AGENTS.md for a user-facing feature setting, add it with a test.

## Acceptance criteria
- Test: a diff touching only `work/reports/9999/x.md` runs no build/test/smoke/audit/remote-validation step and prints the skip reason; the cheap guards still ran.
- Test: a diff touching one `src/**` file plus a `work/` file runs the full path.
- Test: a diff touching `package.json` or `repoos.toml` runs the full path.
- Test: when the changed-path computation fails, the full path runs (fail closed).
- Test: a binary added under `work/` still fails the task-asset guard even in skip mode.
- Handoff for a bookkeeping-only branch no longer queues for a remote-validation slot.
- `docs/` and `user-docs/check.md` describe the rule; `repoos check` passes on this task.

## Notes for AI
Start from `repoos.toml` `[[check.steps]]`, `src/commands/check.ts` (scoped `--changed main` path computation) and `src/server/handoff.ts` / `src/server/remote-validation.ts` (where a handoff chooses remote validation). Read `user-docs/check.md` and `docs/close-out-pipeline.md` first. Keep the allowlist small and explicit; never widen it to include `src/`. Context: filed 2026-11-08 after #1055's 7 handoff rounds for a report-only diff.

## Activity

- 2026-11-08T02:53:59Z · created · njachowski@gmail.com
- 2026-11-08T02:54:04Z · cli_override, model_override, review_cli_override, review_model_override
- 2026-11-08T02:54:06Z · status inbox→ready
- 2026-11-08T06:05:22Z · status ready→active, branch
- 2026-11-08T06:10:32Z · message_queued at 2026-11-08T06:10:32.950Z
- 2026-11-08T06:14:58Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T06:20:03Z · message_delivered: 1 message(s)
- 2026-11-08T06:20:47Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Task #1059 is still active and has no implementation changes on its branch. The worktree is clean, and no handoff has been requested. I have not implemented the gate or run `repoos check`, so I cannot truthfully emit the handoff signal. · stderr: (empty)
- 2026-11-08T06:26:00Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-08T06:26:19Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Task #1059 is blocked by conflicting instructions: its specification requires configuring the skip in `repoos.toml`, while the runner instructions explicitly say never to edit that file. The existing check steps are defined there, so the r… · stderr: Reading additional input from stdin...
