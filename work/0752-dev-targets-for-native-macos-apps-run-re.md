---
last_close_out_gate_ms: 54300
last_close_out_gate_at: "2026-10-10T02:06:08.797Z"
id: "0752"
title: "Dev targets for native macOS apps: run, restart and show logs for a non-URL process"
type: feature
status: review
priority: p2
area: macos
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/dev-targets-for-native-macos-apps-run-re
model_override: opencode/big-pickle
created_at: "2026-10-09T20:30:41Z"
updated_at: "2026-10-10T02:06:08Z"
review_passes: 1
---
## Problem

Dev targets (#0747, `user-docs/dev-targets.md`) assume a `server` has a URL or an `artifact` produces a file. A native macOS app like Divot is a long-lived foreground process with no URL and no build artifact that exits. Divot's bar (`swift run --package-path macos divot`) therefore cannot be started, stopped, restarted or have its logs viewed from the Dev page. Its web site can, with HMR.

## Desired UX

A declared dev target can run a native app process: the Dev page shows running / stopped / failed, offers start, stop and restart (restart rebuilds and relaunches), and shows the last output lines, just like a URL-backed target.

## Acceptance criteria

- Decide and document the schema: either allow `kind = "server"` without `url` (with a process-alive health check), or add a `kind = "process"`. Reject rows that set neither a URL nor a process health check.
- Starting the target runs the declared command in the project root and keeps it alive independent of the browser, as URL targets do today.
- Restart stops the old process before launching a new one and does not leave an orphan (AGENTS.md process-group rule applies).
- The Dev page and `repoos dev <name>` show state and logs for the target; add tests for the parser and lifecycle.
- Divot can declare `swift run --package-path macos divot` as a target without a URL, and the target is reported running while the process lives.
- `repoos check` passes.

## Notes for AI

Motivating project: divot (`~/code/nick/divot`). Keep Divot's own repoos.toml entries as the reference fixture. Do not run long-lived processes while testing; use fake commands in tests.

## Shots
```json
[
{
"label": "Add-dev-target dialog: native app process kind and copy",
"target": "default",
"route": "/settings?tab=advanced",
"highlight": ".dev-target-modal",
"steps": [
{
"click": "[data-test-id=\"dev-targets-add\"]"
},
{
"waitMs": 400
}
]
},
{
"label": "Dev page empty state naming the process kind",
"target": "default",
"route": "/dev",
"highlight": ".dev-empty"
}
]
```

## Activity

- 2026-10-09T20:30:41Z · created · njachowski@gmail.com
- 2026-10-10T00:50:52Z · status inbox→ready
- 2026-10-10T00:52:32Z · model_override
- 2026-10-10T00:52:55Z · status ready→active, branch
- 2026-10-10T01:41:23Z · body
- 2026-10-10T01:45:51Z · body: section Shots
- 2026-10-10T01:54:02Z · status active→review
- 2026-10-10T01:54:53Z · note: review pass 1: good to go
- 2026-10-10T02:06:08Z · close-out gate completed in 54s

