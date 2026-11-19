---
id: "1228"
title: "QA pass: CLI help and error messages match the docs and read in plain English"
type: bug
status: review
priority: p2
area: core
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-cli-help-and-error-messages-matc
created_at: "2026-11-19T11:47:39Z"
updated_at: "2026-11-19T12:52:57Z"
last_check_failure: "repoos check at 2026-11-19T12:23:26.625Z: repoos check failed: ui verification failed (2 issue(s)): [overflow] CLI reference: newly documented checks timings/slots, certify, migrate and rm sections: body scrollWidth 1594 > innerWidth 1024@1024px; [overflow] CLI reference: newly documented checks timings/slots, certify, migrate and rm sections: body scrollWidth 1282 > innerWidth 375@375px"
---
## Problem
CLI commands, flags and error messages may be out of step with user-docs/cli.md and use jargon.
## Desired UX
Every repoos command's --help matches user-docs/cli.md, and common errors say what went wrong and what to do next in plain English.
## Acceptance criteria
- Compare `repoos --help` and each command's help with user-docs/cli.md; fix mismatches and the most confusing error messages with tests.
- Read-only against any server: no ssh, no config changes, never run destructive commands.
- Commit docs/qa/2026-11-cli-help-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "CLI reference: newly documented checks timings/slots, certify, migrate and rm sections",
"target": "Docs site",
"route": "/cli",
"highlight": "#repoos-checks-timings-repoos-checks-slots"
},
{
"label": "Control-plane table now lists summary, review followup, watch and allowlist",
"target": "Docs site",
"route": "/cli"
}
]
```

## Activity

- 2026-11-19T11:47:39Z · created · t@t
- 2026-11-19T11:47:43Z · status inbox→ready
- 2026-11-19T11:47:44Z · status ready→active, branch
- 2026-11-19T11:47:44Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T12:05:02Z · body
- 2026-11-19T12:10:18Z · body
- 2026-11-19T12:18:43Z · body
- 2026-11-19T12:20:12Z · body
- 2026-11-19T12:20:17Z · body
- 2026-11-19T12:21:24Z · CTO nudge: held — handoff gate is running
- 2026-11-19T12:23:23Z · note: ui verification failed: ui verification failed (2 issue(s)): [overflow] CLI reference: newly documented checks timings/slots, certify, migrate and rm sections: body scrollWidth 1594 > innerWidth 1024@1024px; [overflow] CLI reference: newly documented checks timings/slots, certify, migrate and rm sections: body scrollWidth 1282 > innerWidth 375@375px
- 2026-11-19T12:23:23Z · message_queued at 2026-11-19T12:23:23.507Z
- 2026-11-19T12:23:26Z · message_delivered: 1 message(s)
- 2026-11-19T12:31:23Z · body
- 2026-11-19T12:37:01Z · body
- 2026-11-19T12:39:37Z · note: ui verification passed: 1 of 2 shots captured with clean console
- 2026-11-19T12:39:38Z · message_queued at 2026-11-19T12:39:38.541Z
- 2026-11-19T12:41:24Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T12:42:46Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-19T12:42:49Z · message_delivered: 1 message(s)
- 2026-11-19T12:48:03Z · body
- 2026-11-19T12:51:24Z · CTO nudge: held — handoff gate is running
- 2026-11-19T12:52:55Z · note: ui verification passed: 1 of 2 shots captured with clean console
- 2026-11-19T12:52:57Z · status active→review
- 2026-11-19T12:52:57Z · message_queued at 2026-11-19T12:52:57.598Z
