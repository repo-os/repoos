---
id: "0721"
title: "Easter eggs bundle: stuck-timer source, needs_input clear on new run, stale provider balance, agent-review test races"
type: chore
status: active
priority: p2
area: [server, web]
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/easter-eggs-bundle-stuck-timer-source-ne
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T14:27:52Z"
updated_at: "2026-10-06T15:55:40Z"
dev_error_count: 1
---
## Problem

Four small, independent fixes from the 2026-10-06 run, bundled so they land in one worktree and one gate run instead of four.

1. #0719: TaskCard 'stuck · silent Nm' counts from the turn start after a reload (stores/repo.ts fetchRunning seeds agentActivityAt from startedAt). Make /api/agents/running return the server's lastOutputAt and seed from it.
2. #0716: the needs_input provider-failure/degenerate flag stays set while a resumed run is progressing; clear it when a new run starts.
3. #0707: provider balances in Settings are stale; show an as-of time and a Refresh that gives feedback.
4. src/ui-app/tests/agent-review.test.ts has timing races: a fixed assertion at ~:349 (res.status 202) failed #0679's remote gate, and a counter read at ~:652 failed #0705's. Replace point-in-time reads with waitFor on the condition across the file.

## Desired UX

Each of the four behaves as its own task describes (read #0719, #0716, #0707 first); no behaviour change beyond that.

## Acceptance criteria

- One test per item (item 4: the whole agent-review.test.ts passes 5 times in a row under load, e.g. run with the full suite).
- repoos check passes. Mark #0719, #0716 and #0707 superseded in their task files when done.

## Notes for AI

Keep each item small and separate in commits. Do not touch the degenerate detector (#0718) or remote validation (#0717).

## Shots
```json
[
  {
    "label": "Provider balances with as-of time and Refresh feedback",
    "target": "default",
    "route": "/agents?tab=providers",
    "highlight": ".mp-panel"
  },
  {
    "label": "Task card stuck hint uses server lastOutputAt after reload",
    "target": "default",
    "route": "/"
  }
]
```

## Activity

- 2026-10-06T14:27:52Z · created · unknown
- 2026-10-06T14:30:23Z · cli_override, model_override
- 2026-10-06T14:31:28Z · title, body
- 2026-10-06T14:43:17Z · status inbox→ready
- 2026-10-06T14:43:20Z · status ready→active, branch
- 2026-10-06T14:56:36Z · body: section Shots
- 2026-10-06T15:02:13Z · body
- 2026-10-06T15:12:08Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-10-06T15:17:57Z · body
- 2026-10-06T15:55:40Z · needs_input
