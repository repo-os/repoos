---
id: "1087"
title: "Handoff-wait follow-ups: render the waiting label in the drawer, wait in fail-fast git paths, label tests (from #1082)"
type: feature
status: active
priority: p3
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/handoff-wait-follow-ups-render-the-waiti
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-10T09:25:17Z"
updated_at: "2026-11-12T13:24:00Z"
last_check_failure: "repoos check at 2026-11-12T12:44:33.058Z: repoos check failed: ui verification failed (1 issue(s)): [missing-target] Task drawer shows the check wait reason (target \"default\"): highlight [data-test-id=\"close-out-check-progress\"] matched nothing on /work?task=1087&tab=changes (http://127.0.0.1:59380/work?shotState=drawer:handoffWaiting)"
handoff_signal_retry_count: 1
---
Follow-ups deferred from #1082 pass 3: (1) wire statusProgressLabel/handoffWaitingReason into the rendered progress line in TaskDrawer.vue so the drawer says what it is waiting for instead of 'starting'; (2) decide whether routes/tasks.ts waitForCheckGate:false and lockfile-conflict.ts add/commit should also wait (bounded) on a live check lock; (3) test the label path end to end. Do not edit repoos.toml.

## Shots
```json
[
{
"label": "Task drawer shows the check wait reason",
"target": "default",
"route": "/work?task=1087&tab=changes",
"highlight": "[data-test-id=\"close-out-check-progress\"]",
"state": "drawer:handoffWaiting"
}
]
```

## Activity

- 2026-11-10T09:25:17Z · created · njachowski@gmail.com
- 2026-11-10T09:25:17Z · needs_input
- 2026-11-12T12:17:20Z · cli_override, model_override
- 2026-11-12T12:17:22Z · status inbox→ready
- 2026-11-12T12:17:24Z · status ready→active, needs_input, branch
- 2026-11-12T12:19:08Z · body
- 2026-11-12T12:24:49Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The drawer now passes its computed label to the progress detail, and the close-out and git-hook paths remain fail-fast by design. The UI build passed, but the scoped RepoOS check failed: the new drawer test still renders “checking commit” … · stderr: Reading additional input from stdin... 2026-11-12T12:18:07.019346Z ERROR codex_core::tools::router: error=apply_patch verification failed: invalid hunk at line 14, Unexpected line found in update hunk: '*** Update File: /Users/nick/code/nick/repoos-worktrees/feat/handoff-wait-follow-ups-render-the-waiti/src/ui-app/src…
- 2026-11-12T12:44:29Z · note: ui verification failed (1 issue(s)): [missing-target] Task drawer shows the check wait reason (target "default"): highlight [data-test-id="close-out-check-progress"] matched nothing on /work?task=1087&tab=changes (http://127.0.0.1:59380/work?shotState=drawer:handoffWaiting)
- 2026-11-12T12:44:29Z · message_queued at 2026-11-12T12:44:29.900Z
- 2026-11-12T12:44:32Z · message_delivered: 1 message(s)
- 2026-11-12T12:46:01Z · body
- 2026-11-12T12:47:17Z · body
- 2026-11-12T13:19:34Z · body
- 2026-11-12T13:23:59Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Task drawer shows the check wait reason (target "default"): loading state detected: loading text "Loading changes…" on /work?task=1087&tab=changes (http://127.0.0.1:46505/work?shotState=drawer:handoffWaiting)
- 2026-11-12T13:24:00Z · message_queued at 2026-11-12T13:24:00.014Z
