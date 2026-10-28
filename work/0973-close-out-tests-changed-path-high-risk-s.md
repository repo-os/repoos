---
id: "0973"
title: "Close-out tests: changed-path + high-risk suites, full suite at release"
type: feature
status: active
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-tests-changed-path-high-risk-s
cli_override: codex
model_override: gpt-6-luna
review_cli_override: cursor
review_model_override: grok-4.7-low
created_at: "2026-10-28T09:17:44Z"
updated_at: "2026-10-28T13:28:58Z"
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-10-28T11:49:16.051Z\",\"reason\":\"clean-exit-without-handoff\"}]"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"codex\",\"model\":\"gpt-6.1-sol\",\"at\":\"2026-10-28T12:16:50.517Z\",\"kind\":\"dev-error\"}]"
---
## Problem
Move to done runs the full test suite: about 95% of a ~57 minute close-out on this laptop, and slower when engineers run at the same time. Close-outs time out, so tasks get hand-merged. The other gate steps take seconds when the machine is idle (contrast audit 18s, docs build 6s); #0970 measured them, and now records per-step timings.

## Desired UX
New goal: cut test time at close-out without losing real safety.
1. Record per-test-file durations from vitest (the JSON reporter or similar) on every tests step, and show the slowest files in the timings report.
2. Close-out (Move to done) tests: run changed-path tests (vitest --changed against the merge base, the same mechanism `repoos check --changed` uses), PLUS a fixed "always run" set of high-risk suites. Make that set a check-plan option (for example `alwaysRun` globs on the tests step), and default it to the close-out, handoff, git-worker, server-boot and task-parser suites. Keep the list short and say in your final message why each one is on it.
3. The full suite still runs under `repoos check --profile release` (or `--full-tests`) and on demand. Document this in user-docs/check.md, and say plainly that close-out no longer runs every test.
4. Fail closed: if the changed-test list can't be computed (no merge base, or a git error), close-out runs the full suite.
5. Don't edit repoos.toml. If the defaults need a repoos.toml entry, put it in your final message and the driver will apply it on main.


## Acceptance criteria
- Close-out runs changed-path tests plus the alwaysRun set; a test proves an unrelated suite is skipped and an alwaysRun suite still runs.
- No merge base, or a git error: close-out runs the full suite (test).
- `repoos check --profile release` runs every test.
- Per-test-file durations are recorded and the slowest files show in the timings report.
- user-docs/check.md says close-out no longer runs every test.

## Notes for AI
Builds on #0970 (step_timings in check_runs, the timings report). Do not edit repoos.toml; landing refuses it. Put any needed repoos.toml entry in your final message and the driver applies it on main.

## Shots
```json
[
{
"label": "Always-run test suite globs in Advanced settings",
"target": "default",
"route": "/settings?tab=advanced&focus=check.alwaysRun",
"highlight": "[data-config-key=\"check.alwaysRun\"]",
"steps": [
{
"waitFor": "[data-config-key=\"check.alwaysRun\"]"
}
]
}
]
```

## Activity

- 2026-10-28T09:17:44Z · created · njachowski@gmail.com
- 2026-10-28T11:30:40Z · cli_override, model_override
- 2026-10-28T11:30:54Z · status inbox→ready
- 2026-10-28T11:31:01Z · status ready→active, branch
- 2026-10-28T11:33:00Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-28T11:38:33Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-28T11:44:07Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-28T11:49:16Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-10-28T12:00:35Z · body
- 2026-10-28T12:16:50Z · agent exited with an error (codex) · 2026-10-28T12:12:05.482501Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out
- 2026-10-28T12:17:25Z · engineer crash recovery: resuming codex + gpt-6.1-sol (1/12 crashes in 30m) · 2026-10-28T12:12:05.482501Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out
- 2026-10-28T12:26:02Z · review_cli_override
- 2026-10-28T12:26:05Z · review_model_override
- 2026-10-28T13:28:51Z · model_override
- 2026-10-28T13:28:58Z · engineer stopped by request
- 2026-10-28T13:28:58Z · needs_input
