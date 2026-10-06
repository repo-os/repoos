---
id: "0721"
title: "Easter eggs bundle: stuck-timer source, needs_input clear on new run, stale provider balance, agent-review test races"
type: chore
status: review
priority: p2
area: [server, web]
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/easter-eggs-bundle-stuck-timer-source-ne
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T14:27:52Z"
updated_at: "2026-10-06T17:21:57Z"
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
- 2026-10-06T16:01:32Z · body
- 2026-10-06T16:24:03Z · handoff failed · remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s
[validate] cloning bundle /home/nick/.repoos-0721-4e99e8fe.bundle
warning: You appear to have cloned an empty repository.
fatal: unable to read tree (25c22c96a27f03b0c4de97fbff14af7d4b037c08) — fix it in the feature branch and re-run the gate
- 2026-10-06T16:29:44Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-06T16:29:44Z · status review→active
- 2026-10-06T16:29:55Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s
[validate] cloning bundle /home/nick/.repoos-0721-f4fad1da.bundle
warning: You appear to have cloned an empty repository.
fatal: unable to read tree (25c22c96a27f03b0c4de97fbff14af7d4b037c08) — fix it in the feature branch and re-run the gate
- 2026-10-06T16:35:44Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-06T16:35:44Z · status review→active
- 2026-10-06T16:35:52Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s
[validate] cloning bundle /home/nick/.repoos-0721-11858811.bundle
warning: You appear to have cloned an empty repository.
fatal: unable to read tree (25c22c96a27f03b0c4de97fbff14af7d4b037c08) — fix it in the feature branch and re-run the gate
- 2026-10-06T16:41:44Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-06T16:41:44Z · status review→active
- 2026-10-06T16:45:48Z · handoff failed · task-file handoff failed at check · repoos check failed: [32m✓[39m tests/repo-commit-route.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 206[2mms[22m[39m · [32m✓[39m tests/tunnel-assistant.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 84[2mms[22m[39m · [32m✓[39m tests/area-picker.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 101[2mms[22m[39m · [32m✓[39m tests/settings-location.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m · [32m✓[39m tests/needs-input-ui.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 5[2mms[22m[39m · [32m✓[39m tests/telegram-chat-routes.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 36[2mms[22m[39m · [32m✓[39m tests/drawer-load.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 122[2mms[22m[39m · [32m✓[39m tests/playground-chat.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 6[2mms[22m[39m
- 2026-10-06T16:51:44Z · watchdog: restarted engineer after identical check failure · branch tip unchanged since the last failing handoff validation
- 2026-10-06T17:21:55Z · status active→review
- 2026-10-06T17:21:57Z · note: shots: skipped — 1 handoff shot already captured during finalization (#0680)
