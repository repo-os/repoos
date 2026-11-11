---
id: "1087"
title: "Handoff-wait follow-ups: render the waiting label in the drawer, wait in fail-fast git paths, label tests (from #1082)"
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI"
priority: p3
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-10T09:25:17Z"
updated_at: "2026-11-10T09:25:17Z"
---
Follow-ups deferred from #1082 pass 3: (1) wire statusProgressLabel/handoffWaitingReason into the rendered progress line in TaskDrawer.vue so the drawer says what it is waiting for instead of 'starting'; (2) decide whether routes/tasks.ts waitForCheckGate:false and lockfile-conflict.ts add/commit should also wait (bounded) on a live check lock; (3) test the label path end to end. Do not edit repoos.toml.

## Activity

- 2026-11-10T09:25:17Z · created · njachowski@gmail.com
- 2026-11-10T09:25:17Z · needs_input
