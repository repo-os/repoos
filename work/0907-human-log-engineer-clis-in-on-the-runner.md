---
id: "0907"
title: "Human: log engineer CLIs in on the runners and verify one real remote engineer run (#0904)"
type: feature
status: inbox
hold: true
priority: p1
area: server
depends_on: ["0915"]
assigned_to: human
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-21T18:13:37Z"
updated_at: "2026-10-22T02:26:56Z"
---
## Problem
#0904 builds running whole engineer sessions on remote runners and is proven with fakes. Using it for real needs a person: the engineer CLIs (opencode, codex, cursor, copilot) must be logged in or given keys on each runner (bee, thinkpad, mini), and one real task must be run end to end.

## Desired UX
A human follows the setup checklist from #0904's docs, then starts one small real task on a runner and confirms the engineer ran there, the branch came back, and handoff and close-out worked.

## Acceptance criteria
- Each runner has the engineer CLIs authenticated per the #0904 checklist, without secrets in repoos.toml, task files or chat.
- One real small task ran its engineer on a runner: transcript streamed to the laptop, commits came back, handoff passed, close-out passed.
- Laptop memory and Playwright process counts before/during are recorded here, plus any failure filed as a follow-up task.

## Notes for AI
Human-only. Do not start this task. It depends on #0904 landing.

## Activity

- 2026-10-21T18:13:37Z · created · njachowski@gmail.com
- 2026-10-21T18:13:54Z · held, assigned_to
- 2026-10-22T02:26:56Z · depends_on
