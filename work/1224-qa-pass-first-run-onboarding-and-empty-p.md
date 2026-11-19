---
id: "1224"
title: "QA pass: first-run onboarding and empty-project states at all screen sizes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-first-run-onboarding-and-empty-p
created_at: "2026-11-19T07:48:01Z"
updated_at: "2026-11-19T09:11:59Z"
handoff_signal_retry_count: 1
dev_error_count: 1
---
## Problem
A brand-new project (no tasks, no agents configured, no runners) has not been QA-checked for what a new user sees.
## Desired UX
Empty Work, Agents and Checks pages explain what to do next in plain English and work at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Check each empty state and first-run path; fix wording, layout and dead links with tests.
- Commit docs/qa/2026-11-first-run-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Checks first-run: no plan — neutral chip, amber reminder, no red error line",
"target": "default",
"route": "/checks?shotState=checks%3AemptyPlan&tab=plan",
"highlight": ".ncpr"
}
]
```

## Activity

- 2026-11-19T07:48:01Z · created · t@t
- 2026-11-19T07:48:18Z · status inbox→ready
- 2026-11-19T07:48:23Z · status ready→active, branch
- 2026-11-19T07:48:23Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T08:12:30Z · body
- 2026-11-19T08:22:29Z · note: stopped orphaned engineer pid 81043
- 2026-11-19T08:22:30Z · note: stopped orphaned engineer pid 81043
- 2026-11-19T08:22:31Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-19T08:22:31Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output. Open Raw CLI error for details. (CLI: the agent process exited with an error — open the task to see the full output)
- 2026-11-19T08:22:33Z · orphaned run process stopped · pid 94299 · just serve-noauth 7272 · cpu 0s · age 30m
- 2026-11-19T08:22:39Z · needs_input
- 2026-11-19T08:22:49Z · body
- 2026-11-19T08:24:35Z · orphaned run process stopped · pid 2869 · just serve-noauth 7279 · cpu 0s · age 20s
- 2026-11-19T08:24:47Z · orphaned run process stopped · pid 3031 · repoos-qa-pass-first-run-onboarding-and-empty-p /Users/nick/code/nick/repoos-worktrees/feat/qa-pass- · cpu 5s · age 33s
- 2026-11-19T08:24:48Z · orphaned run process stopped · pid 5290 · sleep 60 · cpu 0s · age 18s
- 2026-11-19T08:24:48Z · orphaned run process stopped · pid 5750 · sleep 60 · cpu 0s · age 13s
- 2026-11-19T08:24:48Z · orphaned run process stopped · pid 5850 · sleep 60 · cpu 0s · age 12s
- 2026-11-19T08:24:49Z · orphaned run process stopped · pid 5898 · sleep 60 · cpu 0s · age 11s
- 2026-11-19T08:25:04Z · orphaned run process stopped · pid 6399 · sleep 60 · cpu 0s · age 21s
- 2026-11-19T08:25:19Z · orphaned run process stopped · pid 9577 · sleep 60 · cpu 0s · age 10s
- 2026-11-19T08:35:38Z · orphaned run process stopped · pid 90571 · sleep 60 · cpu 0s · age 6s
- 2026-11-19T08:35:52Z · orphaned run process stopped · pid 91610 · sleep 60 · cpu 0s · age 16s
- 2026-11-19T08:35:53Z · orphaned run process stopped · pid 91811 · sleep 60 · cpu 0s · age 16s
- 2026-11-19T08:36:07Z · orphaned run process stopped · pid 93049 · sleep 60 · cpu 0s · age 25s
- 2026-11-19T08:43:04Z · body
- 2026-11-19T08:45:40Z · orphaned run process stopped · pid 80916 · sleep 60 · cpu 0s · age 8s
- 2026-11-19T08:45:44Z · body
- 2026-11-19T08:45:56Z · orphaned run process stopped · pid 82388 · sleep 60 · cpu 0s · age 18s
- 2026-11-19T08:45:57Z · orphaned run process stopped · pid 82676 · sleep 60 · cpu 0s · age 17s
- 2026-11-19T08:46:10Z · orphaned run process stopped · pid 83886 · sleep 60 · cpu 0s · age 27s
- 2026-11-19T08:50:33Z · body
- 2026-11-19T09:00:19Z · CTO nudge: held — handoff gate is running
- 2026-11-19T09:11:58Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-19T09:11:59Z · message_queued at 2026-11-19T09:11:59.281Z
