---
id: "1219"
title: "QA pass: Checks and Releases pages with real data at all screen sizes"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-checks-and-releases-pages-with-r
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-11-19T06:17:33Z"
updated_at: "2026-11-19T07:29:41Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-19T06:56:03.096Z: repoos check failed: rendered-contrast — · div#setting-model_routing.timeoutMs.setting-row > div.setting-info > div.setting-desc — #958ab0 on #ffffff = 3.21 (need ≥4.5, 11px) [settings] \"How long one routing decision may take before the configured\""
review_rounds: 1
routing_switches: 1
review_passes: 1
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-11-19T07:09:54.377Z\",\"kind\":\"dev-error\"}]"
engineer_failover: "{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\"}"
---
## Problem
The Checks and Releases pages have not been checked with long lists, long names and slow data at phone, tablet and desktop widths.
## Desired UX
Long titles, many rows and slow loads stay readable and usable at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only; never open a visible browser or steal focus.
- Use fixtures with long and many rows; fix truncation, overflow and dead controls with tests.
- Commit docs/qa/2026-11-checks-releases-data-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Checks with long step data",
"target": "default",
"route": "/checks?tab=plan",
"highlight": ".ck-steps",
"state": "checks:longData"
},
{
"label": "Releases distribution with long channel data",
"target": "default",
"route": "/releases",
"highlight": ".rel-dist",
"state": "release:longDistribution"
}
]
```

## Activity

- 2026-11-19T06:17:33Z · created · t@t
- 2026-11-19T06:17:35Z · status inbox→ready
- 2026-11-19T06:17:37Z · status ready→active, branch
- 2026-11-19T06:19:45Z · body
- 2026-11-19T06:22:54Z · body
- 2026-11-19T06:23:49Z · body
- 2026-11-19T06:24:19Z · body
- 2026-11-19T06:27:10Z · body
- 2026-11-19T06:32:12Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-19T06:32:13Z · status active→review
- 2026-11-19T06:32:13Z · message_queued at 2026-11-19T06:32:13.997Z
- 2026-11-19T06:32:56Z · note: review pass 1: needs some work
- 2026-11-19T06:32:56Z · message_delivered: 1 message(s)
- 2026-11-19T06:32:56Z · status review→active
- 2026-11-19T06:32:59Z · CTO nudge: held — remote validation is running
- 2026-11-19T06:52:42Z · body
- 2026-11-19T06:55:29Z · CTO nudge: held — handoff gate is running
- 2026-11-19T06:56:00Z · message_queued at 2026-11-19T06:56:00.253Z
- 2026-11-19T06:56:02Z · message_delivered: 1 message(s)
- 2026-11-19T07:07:54Z · message_queued at 2026-11-19T07:07:54.361Z
- 2026-11-19T07:07:54Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T07:08:11Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T07:09:54Z · agent exited with an error (codex) · Codex exited with an error. Open Raw CLI error for details. (CLI: 2026-11-19T07:09:54.049507Z ERROR codex_core::session: failed to record rollout items: thread 01a1f274-2304-74c2-a690-f65c35189b68 not found)
- 2026-11-19T07:09:54Z · engineer crash recovery: switched codex + gpt-6-luna → opencode + opencode-go/deepseek-v4.1-flash after 1/3 crashes in 30m · Codex exited with an error. Open Raw CLI error for details. (CLI: 2026-11-19T07:09:54.049507Z ERROR codex_core::session: failed to record rollout items: thread 01a1f274-2304-74c2-a690-f65c35189b68 not found)
- 2026-11-19T07:09:57Z · needs_input
- 2026-11-19T07:09:57Z · message_delivered: 1 message(s)
- 2026-11-19T07:16:23Z · body
- 2026-11-19T07:25:11Z · body
- 2026-11-19T07:29:41Z · status active→review
