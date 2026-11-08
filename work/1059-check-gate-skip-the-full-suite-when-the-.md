---
last_handoff_failure_fingerprint: "check|repoos check failed: check-fmt:check — Formatting failed — run `bun run fmt` to fix:"
last_handoff_failure_sha: b4f87d328cd27875d9284c01c8ecbe1df0ca150c
id: "1059"
title: "Check gate: skip the full suite when the diff is bookkeeping/docs only"
type: chore
status: active
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/check-gate-skip-the-full-suite-when-the-
cli_override: cursor
model_override: composer-2.5
review_cli_override: github copilot
review_model_override: default
created_at: "2026-11-08T02:53:59Z"
updated_at: "2026-11-08T11:05:31Z"
review_rounds: 2
review_passes: 2
last_check_failure: "repoos check at 2026-11-08T09:00:49.938Z: repoos check failed: tests — version: 0,"
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-11-08T06:26:00.174Z\",\"reason\":\"clean-exit-without-handoff\"}]"
dev_error_count: 1
---
## Problem
`repoos check` runs the full plan (build, format/lint, full test suite, WebKit UI smoke, contrast audit) even when a task's diff contains only task bookkeeping under `work/` (task file, `work/reports/<id>/*`) or other non-code files. Example: #1055 (the weekly worktree cleanup) changed 11 files, all under `work/`, and still waited for a remote-validation slot and ran the full 680-file suite on every handoff attempt, repeating after each outage or capture timeout. That is minutes to hours of wasted time and runner load for a change that cannot affect behavior. The recurring weekly cleanup will hit this every run.

## Desired behavior
- When the diff against the base (the same `changed vs main` computation the scoped check already uses) touches ONLY paths that cannot affect build or behavior, the check runs only the cheap guards and skips build, tests, UI smoke, contrast audit and remote validation, and reports clearly "docs/bookkeeping-only diff: full suite skipped".
- "Cannot affect behavior" is a conservative allowlist: `work/**`, `docs/**`, `user-docs/**`, `inputs/**`, `*.md` at any depth, `schedules/**`. Anything else (src, scripts, package.json, lockfiles, repoos.toml, `.githooks`, config, assets, tests) forces the normal full path. If the changed-path list cannot be computed, fall back to the full path (fail closed).
- Guards that protect the repo still run in the skipped mode: format check on touched files that the formatter covers, the task-asset guard (no binaries under `work/` or `inputs/`), the lockfile/zero-runtime-dependency guard, and the task-file parser check (parser reads every file in `work/`).
- Close-out's gate behaves the same way for such diffs (it already scopes tests to changed paths); make sure a bookkeeping-only task does not trigger the full suite or remote validation there either.
- IMPORTANT: do NOT edit `repoos.toml` in this task (a diff touching `repoos.toml` blocks landing, and runner rules forbid it). Implement the skip in code (`src/commands/check.ts` and the handoff/close-out gate) with the allowlist as a built-in default constant. Make it overridable by an OPTIONAL setting read from `repoos.toml` (for example `[check] docsOnlySkipGlobs` / `docsOnlySkip = true|false`), defaulting to the built-in behaviour when the key is absent, so no change to `repoos.toml` is needed to ship it. If this is a user-facing feature setting, add it to `getConfigSchema()` and the right Settings tab with a test (per AGENTS.md); do not hand-edit `repoos.toml`.

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

## Shots
```json
[
{
"label": "Docs-only check setting",
"target": "default",
"route": "/settings?tab=advanced&focus=check.docsOnlySkip",
"highlight": "[data-config-key=\"check.docsOnlySkip\"]",
"steps": [
{
"waitFor": "[data-config-key=\"check.docsOnlySkip\"]"
}
]
}
]
```

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
- 2026-11-08T06:30:46Z · body: Desired behavior (added 1, removed 1)
- 2026-11-08T06:30:47Z · message_queued at 2026-11-08T06:30:47.343Z
- 2026-11-08T06:31:03Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T06:40:30Z · body
- 2026-11-08T07:05:07Z · body
- 2026-11-08T07:07:20Z · body
- 2026-11-08T07:07:45Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-08T07:07:45Z · message_queued at 2026-11-08T07:07:45.569Z
- 2026-11-08T07:07:45Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The follow-up used the linked RepoOS CLI and started remote validation instead of exercising the new shortcut. It has already started, so I’ll let it finish, then verify the shortcut with this worktree’s compiled CLI. · stderr: (empty)
- 2026-11-08T07:07:45Z · message_delivered: 2 message(s)
- 2026-11-08T07:08:14Z · CTO nudge: held — handoff gate is running
- 2026-11-08T07:38:00Z · message_queued at 2026-11-08T07:38:00.360Z
- 2026-11-08T07:38:03Z · message_delivered: 1 message(s)
- 2026-11-08T07:38:14Z · CTO nudge: held — remote validation is running
- 2026-11-08T07:51:04Z · body
- 2026-11-08T07:53:02Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-08T07:53:14Z · CTO nudge: held — handoff gate is running
- 2026-11-08T08:03:09Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-08T08:03:10Z · message_queued at 2026-11-08T08:03:10.112Z
- 2026-11-08T08:03:13Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T08:08:15Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-08T08:13:06Z · message_queued at 2026-11-08T08:13:06.885Z
- 2026-11-08T08:14:32Z · message_delivered: 1 message(s)
- 2026-11-08T08:32:51Z · body
- 2026-11-08T08:33:36Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-08T08:33:36Z · message_queued at 2026-11-08T08:33:36.746Z
- 2026-11-08T08:33:36Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: no assistant message · stderr: Reading additional input from stdin...
- 2026-11-08T08:33:36Z · message_delivered: 2 message(s)
- 2026-11-08T08:38:14Z · CTO nudge: held — handoff gate is running
- 2026-11-08T08:45:18Z · cli_override, model_override
- 2026-11-08T08:45:23Z · review_cli_override, review_model_override
- 2026-11-08T08:49:09Z · CTO nudge: held — handoff gate is running
- 2026-11-08T09:00:46Z · message_queued at 2026-11-08T09:00:46.811Z
- 2026-11-08T09:00:46Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-11-08T09:00:49Z · message_delivered: 1 message(s)
- 2026-11-08T09:01:24Z · agent exited with an error (codex) · 2026-11-08T09:00:54.961520Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out
- 2026-11-08T09:01:24Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6.1-terra) is pinned, so RepoOS did not replace it (1/12 crashes in 30m)
- 2026-11-08T09:11:26Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-08T09:16:26Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-08T09:22:59Z · message_queued at 2026-11-08T09:22:59.011Z
- 2026-11-08T09:22:59Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-08T09:24:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T09:45:33Z · body
- 2026-11-08T09:49:09Z · CTO nudge: held — handoff gate is running
- 2026-11-08T09:53:15Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-08T09:53:16Z · status active→review
- 2026-11-08T09:53:16Z · message_queued at 2026-11-08T09:53:16.340Z
- 2026-11-08T09:56:18Z · note: review pass 1: needs some work
- 2026-11-08T09:56:18Z · status review→active
- 2026-11-08T09:56:21Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T09:59:02Z · message_delivered: 1 message(s)
- 2026-11-08T09:59:05Z · CTO nudge: held — remote validation is running
- 2026-11-08T10:00:34Z · body
- 2026-11-08T10:13:28Z · body
- 2026-11-08T10:14:05Z · body
- 2026-11-08T10:19:09Z · CTO nudge: held — handoff gate is running
- 2026-11-08T10:23:04Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-08T10:23:04Z · message_queued at 2026-11-08T10:23:04.935Z
- 2026-11-08T10:24:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T10:29:11Z · CTO action: restart-stalled-agent (resume) · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed
- 2026-11-08T10:31:24Z · message_delivered: 1 message(s)
- 2026-11-08T10:32:15Z · body
- 2026-11-08T10:32:20Z · body
- 2026-11-08T10:39:09Z · message_queued at 2026-11-08T10:39:09.555Z
- 2026-11-08T10:39:09Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-08T10:43:00Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T10:45:27Z · body
- 2026-11-08T10:47:53Z · status active→review
- 2026-11-08T10:50:25Z · message_queued at 2026-11-08T10:50:25.582Z
- 2026-11-08T10:50:28Z · handoff failed · could not auto-retry after check failure · This worktree already has a recorded live engineer for task #review:1059 (pid 31725)
- 2026-11-08T10:50:55Z · note: review pass 2: needs some work
- 2026-11-08T10:50:55Z · status review→active
- 2026-11-08T10:50:58Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T10:56:11Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-08T10:56:11Z · note: handoff requested (cli)
- 2026-11-08T10:59:09Z · CTO nudge: held — handoff gate is running
- 2026-11-08T11:04:30Z · message_delivered: 1 message(s)
- 2026-11-08T11:05:31Z · message_queued at 2026-11-08T11:05:31.738Z
- 2026-11-08T11:05:31Z · handoff failed · task-file handoff failed at check · repoos check failed: check-fmt:check — Formatting failed — run `bun run fmt` to fix:

