---
id: "1222"
title: "QA pass: every Settings tab saves, validates and fits small screens (round 2)"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-every-settings-tab-saves-validat
created_at: "2026-11-19T07:17:47Z"
updated_at: "2026-11-19T08:01:00Z"
---
## Problem
The Settings pages have many toggles and fields; some may not persist, may accept invalid values, or may be unreachable on a phone.
## Desired UX
Every Settings tab saves, validates with plain-English errors, survives reload and stays usable at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus; never write the real repoos.toml.
- Walk every Settings tab; fix issues with tests.
- Commit docs/qa/2026-11-settings-tabs-qa-2.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T07:17:47Z · created · t@t
- 2026-11-19T07:17:52Z · status inbox→ready
- 2026-11-19T07:17:55Z · status ready→active, branch
- 2026-11-19T07:17:55Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T07:29:45Z · message_queued at 2026-11-19T07:29:45.793Z
- 2026-11-19T07:29:46Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T07:32:51Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T07:32:51Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Let me write the full script properly: · stderr: (empty)
- 2026-11-19T07:32:52Z · message_delivered: 1 message(s)
- 2026-11-19T07:32:54Z · message_queued at 2026-11-19T07:32:54.619Z
- 2026-11-19T07:32:54Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T07:36:07Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T07:36:07Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Let me write the full script properly: · stderr: (empty)
- 2026-11-19T07:36:08Z · message_delivered: 1 message(s)
- 2026-11-19T07:37:54Z · message_queued at 2026-11-19T07:37:54.641Z
- 2026-11-19T07:37:54Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T07:39:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T07:41:07Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T07:41:08Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Now run the layout walk alone first — it should be quick: · stderr: (empty)
- 2026-11-19T07:41:08Z · message_delivered: 1 message(s)
- 2026-11-19T07:42:54Z · message_queued at 2026-11-19T07:42:54.646Z
- 2026-11-19T07:42:54Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T07:47:48Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T07:55:29Z · queued message undelivered for 13m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T07:55:29Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Those three timeouts are hidden/disabled fields (`v-show` panels keep all tabs' controls in the DOM, so my enumeration included invisible ones). Fill timeouts on non-editable fields = skip, not failure. Let me wait for the audit to finish: · stderr: (empty)
- 2026-11-19T07:55:30Z · message_delivered: 1 message(s)
- 2026-11-19T07:57:57Z · message_queued at 2026-11-19T07:57:57.308Z
- 2026-11-19T07:57:57Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T08:00:59Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T08:00:59Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Killed. Now the corrected audit — visible controls only, instant skip of disabled fields: · stderr: (empty)
- 2026-11-19T08:01:00Z · message_delivered: 1 message(s)
