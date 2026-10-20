---
id: "0864"
title: "Human: rebuild the shot-runner image on bee and record an end-to-end remote capture proof (#0854)"
type: chore
status: inbox
hold: true
priority: p2
area: server
depends_on: ["0854"]
assigned_to: human
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-20T09:31:45Z"
updated_at: "2026-10-20T09:32:02Z"
---
## Problem
#0854 moves browser shots and UI verification to a runner. Its code and tests can be reviewed without a real runner, but its acceptance criterion "a real end-to-end proof on one runner, recorded in the task" needs a person: rebuild/deploy the runner image (Dockerfile.ci with Playwright/WebKit) on the Tailscale runner (bee) and hand a task off with the runner-only policy.

## Desired UX
A human rebuilds the runner image from the merged #0854 branch, runs one task handoff with the browser-capture policy set to runner-only, and records local-vs-remote Playwright process counts and the captured shot in this task.

## Acceptance criteria
- The runner image on bee includes WebKit readable by the run user.
- One real handoff captured shots and UI verification on the runner (not a local fallback), recorded here with before/during local Playwright counts.
- Any failure is filed as a follow-up task.

## Notes for AI
Human-only. Do not start this task. It depends on #0854 landing.

## Activity

- 2026-10-20T09:31:45Z · created · njachowski@gmail.com
- 2026-10-20T09:32:02Z · held, assigned_to
