---
updated_at: "2026-08-26T19:15:59Z"
review_passes: 1
id: "0302"
title: Build the native connected-server mobile shell and four-item navigation
type: feature
status: review
priority: p1
area: mobile
assigned_to: ai
created_by: ""
branch: feat/build-the-native-connected-server-mobile
model_override: deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo
review_model_override: deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo
created_at: "2026-08-26T16:39:04Z"
check_retry_count: 2
handoff_signal_retry_count: 1
---
## Problem

The native mobile app has a server picker, but the connected server still needs a purpose-built mobile shell. The desktop topbar/sidebar and five-item navigation do not provide the intended iOS/Android experience.

## Desired outcome

Selecting a server enters a native-feeling server-scoped shell with a compact back/server header and exactly four bottom destinations: Work, Search, More, and Settings. More opens an action sheet containing Agents, Context, Activity, and Server connections.

## Acceptance criteria

- [ ] Hide desktop-only topbar, sidebar, integration chrome, and five-item mobile navigation in the native mobile shell.
- [ ] Add a native connected-server header with back-to-picker behavior, server name, status, and server switcher affordance.
- [ ] Add exactly four bottom destinations: Work, Search, More, Settings.
- [ ] Implement More as a dismissible native action sheet with Agents, Context, Activity, and Server connections.
- [ ] Preserve platform safe areas, touch targets, keyboard behavior, and Android back navigation.
- [ ] Keep the mobile app as its own build and reuse shared auth, API, and connection services.
- [ ] Add component/browser coverage for navigation, server switching, action-sheet dismissal, and back behavior.

## Notes

Follow docs/mobile-ux-strategy.md and docs/mobile-architecture.md. Use Ionic Vue primitives where they provide native behavior, with RepoOS custom styling.

## Activity

- 2026-08-26T16:39:04Z · created · unknown
- 2026-08-26T18:14:02Z · status inbox→ready
- 2026-08-26T18:14:34Z · model_override
- 2026-08-26T18:14:43Z · review_model_override
- 2026-08-26T18:14:54Z · status ready→active, branch
- 2026-08-26T19:09:58Z · handoff failed · check failed after 2 automatic retries · repoos check failed: [90m745|[39m       [35mawait[39m watchdog[33m.[39m[34mcheckNow[39m()[33m;[39m · [90m746|[39m · [90m747|[39m       expect(readFileSync(fx.taskPath, "utf8")).not.toContain("watchdo… · [90m   |[39m                                                     [31m^[39m · [90m748|[39m       [34mexpect[39m([34mparseTaskAt[39m(fx)[33m.[39mstatus)[33m.[39m[34mtoBe[39m([32m"active"[39m)[33m;[39m [90m// untouched[39m · [90m749|[39m     } [35mfinally[39m { · [31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/6]⎯[22m[39m · error: script "test" exited with code 1
- 2026-08-26T19:15:33Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — check failed after 2 automatic retries · repoos check failed: [90m745|[39m       [35mawait[39m watchdog[33m.[39m[34mcheckNow[39m()[33m;[39m · [90m746|[39m · [90m747|[39m       expect(readFileSync(fx.taskPath, "utf8")).not.toContain("watchdo… · [90m   |[39m                                                     [31m^[39m · [90m748|[39m       [34mexpect[39m([34mparseTaskAt[39m(fx)[33m.[39mstatus)[33m.[39m[34mtoBe[39m([32m"active"[39m)[33m;[39m [90m// untouched[39m · [90m749|[39m     } [35mfinally[39m { · [31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/6]⎯[22m[39m · error: script "test" exited with code 1 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off

