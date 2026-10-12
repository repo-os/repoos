---
id: "0759"
title: Add Solarized theme variants
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-solarized-theme-variants
cli_override: claude code
model_override: haiku
created_at: "2026-10-12T11:10:52Z"
updated_at: "2026-10-12T12:22:07Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-12T12:17:00.557Z: repoos check failed: rendered-contrast — · div.diff-file-item > span.diff-file-delta > span.diff-file-add — #859900 on #073642 = 4.06 (need ≥4.5, 10px) [drawer-changes] \"+1\""
last_handoff_failure_fingerprint: "check|remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on bee — fix it in the feature branch and re-run the gate"
last_handoff_failure_sha: 458a36d9a44312848167b6a10754b0c8495ec640
---
## Problem

RepoOS does not offer a Solarized theme, a popular theme among its coding-focused audience.

## Desired UX

Users can choose a Solarized theme in either light or dark mode, following the same theme setup and conventions as the existing themes.

## Acceptance criteria

- [ ] Add a Solarized light theme.
- [ ] Add a Solarized dark theme.
- [ ] Make both variants available through the existing theme selection experience.
- [ ] Follow the setup pattern used by the other themes.

## Notes for AI

- Inspect how the existing themes are set up and follow that pattern.
- Assume the two variants should be available wherever users currently choose themes; do not change the default theme.

## Scope

Covers adding Solarized light and dark theme variants.

## Original prompt

My friend asked me to add a solarised theme to repoos, can you do it? see how the other themes were setup and follow the same pattern, it needs to have both light and dark versions of the theme (it's popular with coders, my main audience for repoos).

## Shots
```json
[
{
"label": "Solarized dark theme selector",
"target": "default",
"route": "/repo/settings?tab=theme",
"highlight": "[data-ui-theme=\"solarized\"]",
"state": "closeOut:active"
},
{
"label": "Solarized light theme selector",
"target": "default",
"route": "/repo/settings?tab=theme",
"highlight": "[data-ui-theme=\"solarized\"]",
"steps": [
{
"click": "button[data-theme=\"light\"]"
}
],
"state": "closeOut:active"
}
]
```

## Activity

- 2026-10-12T11:10:52Z · created · hello@repoos.org
- 2026-10-12T11:11:11Z · status draft→inbox, title, area, body
- 2026-10-12T11:12:19Z · status inbox→ready
- 2026-10-12T11:12:24Z · cli_override, model_override
- 2026-10-12T11:12:35Z · model_override
- 2026-10-12T11:12:37Z · status ready→active, branch
- 2026-10-12T11:16:05Z · body
- 2026-10-12T11:17:48Z · body
- 2026-10-12T11:18:33Z · body
- 2026-10-12T11:20:08Z · body
- 2026-10-12T11:21:40Z · body
- 2026-10-12T11:22:25Z · body: section Shots
- 2026-10-12T11:28:10Z · handoff failed · remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on bee — fix it in the feature branch and re-run the gate
- 2026-10-12T11:33:32Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on bee — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-12T11:33:32Z · note: handoff requested (cli)
- 2026-10-12T11:38:57Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on bee — fix it in the feature branch and re-run the gate
- 2026-10-12T11:42:17Z · body
- 2026-10-12T11:43:56Z · body
- 2026-10-12T11:44:59Z · body
- 2026-10-12T11:46:04Z · body
- 2026-10-12T11:47:39Z · body
- 2026-10-12T11:48:41Z · body
- 2026-10-12T11:49:12Z · message_queued at 2026-10-12T11:49:12.137Z
- 2026-10-12T11:50:18Z · body
- 2026-10-12T11:51:22Z · body
- 2026-10-12T11:52:41Z · body
- 2026-10-12T11:53:54Z · body
- 2026-10-12T11:55:08Z · body
- 2026-10-12T11:55:56Z · note: handoff requested (ui-review)
- 2026-10-12T11:57:09Z · message_queued at 2026-10-12T11:57:09.129Z
- 2026-10-12T12:01:24Z · handoff failed · ui-review handoff failed at check · remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on bee — fix it in the feature branch and re-run the gate
- 2026-10-12T12:05:14Z · message_delivered: 2 message(s)
- 2026-10-12T12:10:25Z · body
- 2026-10-12T12:14:09Z · message_queued at 2026-10-12T12:14:09.940Z
- 2026-10-12T12:17:00Z · message_delivered: 1 message(s)
- 2026-10-12T12:20:15Z · body
- 2026-10-12T12:22:07Z · body
