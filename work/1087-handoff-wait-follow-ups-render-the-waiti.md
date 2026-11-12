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
updated_at: "2026-11-12T12:19:08Z"
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
