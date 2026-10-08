---
id: "0745"
title: "Classify runner infrastructure failures (bun install EACCES, ssh, container, host permissions) as infra, not test failures: retry on another host and mark the host degraded"
type: bug
status: active
priority: p1
area: server
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: feat/classify-runner-infrastructure-failures-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-08T14:40:08Z"
updated_at: "2026-10-08T14:52:27Z"
---
## Problem

2026-10-08: #0743's handoff failed on mini with 'bun install ... error: EACCES accessing temporary directory' (run as peckjachowski). The pool recorded 'remote validation failed (exit 1)' like a real test failure: no retry on another host, no host flag; the task just sat active until a human read the log. The same day, the hang detector (#0729) classified a run that had ALREADY printed '[validate] gate exit 1' as hung and retried it elsewhere as transient, which hid a genuine test failure (#0737, 2026-10-07). So failures are misclassified in BOTH directions, and a driver or CTO cannot tell 'my code is broken' from 'the host is broken' without reading raw logs.

## Desired UX

- A failure taxonomy for a remote validation run: TEST (the gate ran and a build/lint/test step failed), INFRA (the gate never got to run or was killed by the environment), HUNG, UNREACHABLE. Decide from structured signals, not exit code alone: validate.sh exit codes (add a distinct exit code for 'install/clone/setup failed' and for 'container could not start'), the last '[validate]' marker lines ('gate exit N' present means the gate ran), ssh failures, and known environment patterns (EACCES, ENOSPC, 'no space left', docker daemon errors, 'Module not found' inside node_modules during install).
- INFRA and UNREACHABLE: retry once on a different host automatically, mark the failing host 'degraded' with the cause (visible on the Remote runners tab, in the attention feed and in the pool: a degraded host is skipped until a probe passes), and record the cause as outcome 'infra' in check_runs (not 'fail').
- TEST failures are never retried as transient and never blamed on the host; the failing test names are the headline in the task's failure note.
- The task's failure line says which class it is ('host problem: bun install EACCES on mini; retried on bee').

## Acceptance criteria

- Tests: EACCES during install -> infra, retried on another host, host degraded; gate-exit printed + failures -> TEST (no retry); ssh timeout -> unreachable; degraded host is skipped then recovers after a passing probe. Settings/docs updated (docs/remote-validation.md, docs/agent-run-operations.md). repoos check passes.

## Notes for AI

Read src/server/remote-validation.ts (pool, HangWatchdog, recordRun, infraFail), scripts/remote-runner/validate.sh exit codes, and the Remote runners panel. Do not touch the owner's hosts. Related: #0729, #0739, #0725, #0720.

## Shots
```json
[
  {
    "label": "Remote runners degraded host state",
    "target": "default",
    "route": "/settings?tab=remote",
    "highlight": ".rvr-host-state--bad",
    "steps": [
      {
        "waitMs": 500
      }
    ]
  }
]
```

## Activity

- 2026-10-08T14:40:08Z · created · unknown
- 2026-10-08T14:40:10Z · cli_override, model_override
- 2026-10-08T14:40:12Z · status inbox→ready
- 2026-10-08T14:40:13Z · status ready→active, branch
- 2026-10-08T14:51:52Z · body: section Shots
- 2026-10-08T14:52:27Z · body
