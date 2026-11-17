---
id: "1126"
title: "Releases: 'Generate AI notes and publish' - let the user choose auto-publish or notify-me when the AI draft is ready"
type: feature
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: t@t
branch: feat/releases-generate-ai-notes-and-publish-l
cli_override: opencode
model_override: opencode-go/glm-5.3-flash
created_at: "2026-11-15T08:14:22Z"
updated_at: "2026-11-17T03:47:48Z"
review_passes: 1
last_check_failure: "repoos check at 2026-11-17T02:59:51.120Z: repoos check failed: ui verification failed (6 issue(s)): [console] Failed to preconnect to https://fonts.googleapis.com/. Error: The Internet connection appears to be offline.; [console] Failed to preconnect to https://fonts.gstatic.com/. Error: The Internet connection appears to be offline.; [request] Failed to load resource: The Internet connection appears to be offline. (https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Sora:wght@400;500;600;700;800&family=P… (truncated)"
dev_error_count: 8
engineer_failover: "{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\"}"
---
## Problem

Cutting a release today takes two waits: click Generate AI release notes, wait a few minutes for the draft (a server-tracked run, #0605), then come back and click Publish. Nick often forgets to come back, which wastes time. A human should not have to babysit the draft just to press Publish.

## Desired UX

In the Releases page 'cut a release' panel:

- Clicking **Generate AI release notes** opens a small modal (shared dialog components, not a native confirm) asking what should happen when the draft is ready:
1. **Publish automatically** - as soon as the notes are ready, publish the release with the generated notes and known issues.
2. **Notify me** - when ready, send a notification (in-app plus the existing notification channels) so the user can review the notes and click Publish themselves.
- Also add a single **Generate notes and publish** button that goes straight to option 1 (after a confirm that shows the version and tag that will be cut).
- The choice is remembered as a default, with a way to change it in the panel or Settings (a Settings control is required for any repoos.toml setting).

## Acceptance criteria

- [ ] The modal appears when Generate AI release notes is clicked and offers 'Publish automatically' and 'Notify me', in the shared dialog, keyboard and touch usable, with the version/tag shown.
- [ ] With auto-publish chosen, a finished draft publishes through the same guarded release path as the Publish button (same blockers, version/tag confirmation, clean-main and checks), and the Releases page shows 'Will publish when the notes are ready' with a Cancel that stops it before publishing.
- [ ] If the draft fails, comes back empty, or any release blocker appears (dirty main, tag exists, newer commits since the run started, checks failing), nothing is published and the user is notified why; a failed auto-publish never retries silently.
- [ ] With notify chosen, a notification arrives when the draft is ready, linking to the Releases page with the notes filled in and Publish enabled.
- [ ] The pending choice survives a page reload and a server restart (server-owned, like the draft run), and only one auto-publish can be pending at a time.
- [ ] Never publishes anything the user did not opt into for that exact version; closing the modal without choosing does nothing. Tests cover both choices, cancel, a failed draft, a blocker appearing mid-wait, and restart persistence.
- [ ] Docs (user-docs release page) and any CLI parity (a flag such as repoos release --generate-notes --publish-when-ready, or a reasoned exemption in src/cli/api-route-parity.ts) are updated.

## Notes for AI

Reuse the existing AI-draft run in ReleasesView.vue and the server release run; do not add a second release path. Auto-publish is an outward-facing action, so it must go through every check the manual Publish does and must be cancellable. Follow AGENTS.md UI conventions (shared dialogs, Teleport, no native confirm).

## Shots
```json
[
{
"label": "Generate with AI asks publish automatically or notify, showing the exact tag",
"target": "default",
"route": "/releases",
"highlight": ".rel-whenready",
"steps": [
{
"click": "[data-test-id=\"cut-release-open\"]"
},
{
"waitMs": 400
},
{
"click": "[data-test-id=\"release-generate-notes\"]"
},
{
"waitMs": 400
}
],
"state": "release:cutReady"
},
{
"label": "Will publish v0.6.1 when the notes are ready, with Cancel",
"target": "default",
"route": "/releases",
"highlight": "[data-test-id=\"release-auto-publish\"]",
"state": "release:autoPublishWaiting"
}
]
```

## Activity

- 2026-11-15T08:14:22Z · created · t@t
- 2026-11-15T08:14:23Z · needs_input
- 2026-11-15T08:14:28Z · body: Desired UX (added); Desired behavior (removed)
- 2026-11-15T08:14:29Z · needs_input
- 2026-11-16T23:51:37Z · status inbox→ready
- 2026-11-16T23:51:45Z · status ready→active, branch
- 2026-11-17T00:26:52Z · message_queued at 2026-11-17T00:26:52.655Z
- 2026-11-17T00:26:52Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-17T00:29:21Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T00:29:34Z · note: stopped orphaned engineer pid 47559
- 2026-11-17T00:29:34Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-17T00:29:34Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output. Open Raw CLI error for details. (CLI: the agent process exited with an error — open the task to see the full output)
- 2026-11-17T00:29:36Z · needs_input
- 2026-11-17T00:29:36Z · message_delivered: 1 message(s)
- 2026-11-17T00:30:06Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-17T00:30:07Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:30:21Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-17T00:30:22Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:30:36Z · watchdog: restarting engineer because a queued message waited 4m with no live process
- 2026-11-17T00:30:37Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:33:47Z · body
- 2026-11-17T00:34:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T00:35:31Z · body
- 2026-11-17T00:38:21Z · watchdog: restarting engineer because a queued message waited 11m with no live process
- 2026-11-17T00:38:22Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:38:36Z · watchdog: restarting engineer because a queued message waited 12m with no live process
- 2026-11-17T00:38:37Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:38:51Z · watchdog: restarting engineer because a queued message waited 12m with no live process
- 2026-11-17T00:38:52Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:39:06Z · watchdog: restarting engineer because a queued message waited 12m with no live process
- 2026-11-17T00:39:07Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:39:21Z · watchdog: restarting engineer because a queued message waited 12m with no live process
- 2026-11-17T00:39:22Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:39:36Z · watchdog: restarting engineer because a queued message waited 13m with no live process
- 2026-11-17T00:39:37Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:39:51Z · watchdog: restarting engineer because a queued message waited 13m with no live process
- 2026-11-17T00:39:52Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:40:06Z · watchdog: restarting engineer because a queued message waited 13m with no live process
- 2026-11-17T00:40:07Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:40:21Z · watchdog: restarting engineer because a queued message waited 13m with no live process
- 2026-11-17T00:40:22Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:40:36Z · watchdog: restarting engineer because a queued message waited 14m with no live process
- 2026-11-17T00:40:37Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:40:51Z · watchdog: restarting engineer because a queued message waited 14m with no live process
- 2026-11-17T00:40:52Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:41:06Z · watchdog: restarting engineer because a queued message waited 14m with no live process
- 2026-11-17T00:41:07Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:41:21Z · watchdog: restarting engineer because a queued message waited 14m with no live process
- 2026-11-17T00:41:22Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:41:36Z · watchdog: restarting engineer because a queued message waited 15m with no live process
- 2026-11-17T00:41:37Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:41:51Z · watchdog: restarting engineer because a queued message waited 15m with no live process
- 2026-11-17T00:41:52Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:42:06Z · watchdog: restarting engineer because a queued message waited 15m with no live process
- 2026-11-17T00:42:07Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:42:21Z · watchdog: restarting engineer because a queued message waited 15m with no live process
- 2026-11-17T00:42:22Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:42:36Z · watchdog: restarting engineer because a queued message waited 16m with no live process
- 2026-11-17T00:42:37Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:42:51Z · watchdog: restarting engineer because a queued message waited 16m with no live process
- 2026-11-17T00:42:52Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:42:57Z · body
- 2026-11-17T00:43:06Z · watchdog: restarting engineer because a queued message waited 16m with no live process
- 2026-11-17T00:43:07Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:43:21Z · watchdog: restarting engineer because a queued message waited 16m with no live process
- 2026-11-17T00:43:22Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1126 (pid 57100)
- 2026-11-17T00:45:11Z · body
- 2026-11-17T00:48:51Z · watchdog: restarting engineer because a queued message waited 22m with no live process
- 2026-11-17T00:48:52Z · message_delivered: 1 message(s)
- 2026-11-17T00:56:03Z · body
- 2026-11-17T00:59:42Z · body
- 2026-11-17T01:15:53Z · agent exited with an error (opencode) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: network problem reaching the model provider, not a code issue: ConnectionRefused: Unable to connect. Is the computer able to access the url?)
- 2026-11-17T01:15:53Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: network problem reaching the model provider, not a code issue: ConnectionRefused: Unable to connect. Is the computer able to access the url?)
- 2026-11-17T01:15:54Z · needs_input
- 2026-11-17T01:17:20Z · agent exited with an error (opencode) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: network problem reaching the model provider, not a code issue: ConnectionRefused: Unable to connect. Is the computer able to access the url?)
- 2026-11-17T01:17:20Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: network problem reaching the model provider, not a code issue: ConnectionRefused: Unable to connect. Is the computer able to access the url?)
- 2026-11-17T01:17:22Z · needs_input
- 2026-11-17T01:18:50Z · agent exited with an error (opencode) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: network problem reaching the model provider, not a code issue: ConnectionRefused: Unable to connect. Is the computer able to access the url?)
- 2026-11-17T01:18:50Z · engineer crash recovery: switched opencode + opencode-go/deepseek-v4.1-flash → opencode + opencode-go/glm-5.3-flash after 3/3 crashes in 30m · OpenCode exited with an error. Open Raw CLI error for details. (CLI: network problem reaching the model provider, not a code issue: ConnectionRefused: Unable to connect. Is the computer able to access the url?)
- 2026-11-17T01:18:53Z · needs_input
- 2026-11-17T01:20:20Z · agent exited with an error (opencode) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: network problem reaching the model provider, not a code issue: ConnectionRefused: Unable to connect. Is the computer able to access the url?)
- 2026-11-17T01:20:20Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: network problem reaching the model provider, not a code issue: ConnectionRefused: Unable to connect. Is the computer able to access the url?)
- 2026-11-17T01:20:21Z · needs_input
- 2026-11-17T01:21:44Z · agent exited with an error (opencode) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: network problem reaching the model provider, not a code issue: ConnectionRefused: Unable to connect. Is the computer able to access the url?)
- 2026-11-17T01:21:44Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (2/3 crashes in 30m) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: network problem reaching the model provider, not a code issue: ConnectionRefused: Unable to connect. Is the computer able to access the url?)
- 2026-11-17T01:21:45Z · needs_input
- 2026-11-17T01:23:07Z · agent exited with an error (opencode) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: network problem reaching the model provider, not a code issue: ConnectionRefused: Unable to connect. Is the computer able to access the url?)
- 2026-11-17T01:23:07Z · engineer crash recovery: surfaced instead of switching — RepoOS already switched this task once (opencode + opencode-go/glm-5.3-flash); it will not chain another automatic switch (3/3 crashes in 30m)
- 2026-11-17T01:33:08Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-17T01:34:40Z · agent exited with an error (opencode) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: network problem reaching the model provider, not a code issue: ConnectionRefused: Unable to connect. Is the computer able to access the url?)
- 2026-11-17T01:34:40Z · engineer crash recovery: surfaced instead of switching — RepoOS already switched this task once (opencode + opencode-go/glm-5.3-flash); it will not chain another automatic switch (4/3 crashes in 30m)
- 2026-11-17T01:44:53Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-17T01:54:34Z · message_queued at 2026-11-17T01:54:34.335Z
- 2026-11-17T01:54:34Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-17T01:56:22Z · body
- 2026-11-17T01:58:38Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T01:58:38Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Failures may be from running vitest directly instead of the repo's wrapper. Let me check the test script. · stderr: (empty)
- 2026-11-17T01:58:38Z · message_delivered: 1 message(s)
- 2026-11-17T01:59:34Z · message_queued at 2026-11-17T01:59:34.343Z
- 2026-11-17T01:59:34Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-17T02:02:38Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T02:02:38Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: The report draft exists and the worktree is clean — this session is a resume after crashes, and the implementation appears complete. The queued CTO message asks me to run verification and hand off. Let me run the scoped check. · stderr: (empty)
- 2026-11-17T02:02:39Z · message_delivered: 1 message(s)
- 2026-11-17T02:04:34Z · message_queued at 2026-11-17T02:04:34.342Z
- 2026-11-17T02:04:34Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-17T02:07:38Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T02:07:38Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: The report draft exists and the worktree is clean — this session is a resume after crashes, and the implementation appears complete. The queued CTO message asks me to run verification and hand off. Let me run the scoped check. · stderr: (empty)
- 2026-11-17T02:07:39Z · message_delivered: 1 message(s)
- 2026-11-17T02:09:34Z · message_queued at 2026-11-17T02:09:34.324Z
- 2026-11-17T02:09:34Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-17T02:10:11Z · body
- 2026-11-17T02:12:57Z · note: ui verification failed: ui verification failed (2 issue(s)): [request] HTTP 405 for http://127.0.0.1:34441/api/release/notes (http://127.0.0.1:34441/api/release/notes); [request] Failed to load resource: the server responded with a status of 405 (Method Not Allowed) (http://127.0.0.1:34441/api/release/notes)
- 2026-11-17T02:12:58Z · message_queued at 2026-11-17T02:12:58.022Z
- 2026-11-17T02:13:01Z · message_delivered: 1 message(s)
- 2026-11-17T02:33:43Z · body
- 2026-11-17T02:34:34Z · CTO nudge: held — handoff gate is running
- 2026-11-17T02:36:32Z · note: ui verification passed: 2 of 2 shots captured with clean console (1 shot warning)
- 2026-11-17T02:36:33Z · message_queued at 2026-11-17T02:36:33.207Z
- 2026-11-17T02:39:15Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T02:39:38Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-17T02:39:39Z · message_delivered: 1 message(s)
- 2026-11-17T02:51:24Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: No prior review reports exist for #1126 — the handoff failed before a reviewer ran, so there's no review feedback to address. The only blocker was the report draft length, which is now fixed (1,186 words, under the 1,200 limit, all require… · stderr: (empty)
- 2026-11-17T02:52:26Z · orphaned run process stopped · pid 83951 · sleep 60 · cpu 0s · age 16s
- 2026-11-17T02:52:26Z · orphaned run process stopped · pid 85496 · sleep 60 · cpu 0s · age 11s
- 2026-11-17T02:52:26Z · orphaned run process stopped · pid 85753 · sleep 60 · cpu 0s · age 10s
- 2026-11-17T02:52:56Z · orphaned run process stopped · pid 87757 · sleep 60 · cpu 0s · age 35s
- 2026-11-17T02:52:56Z · orphaned run process stopped · pid 97393 · sleep 60 · cpu 0s · age 10s
- 2026-11-17T02:53:33Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-17T02:54:34Z · CTO nudge: held — handoff gate is running
- 2026-11-17T02:59:47Z · note: ui verification failed (6 issue(s)): [console] Failed to preconnect to https://fonts.googleapis.com/. Error: The Internet connection appears to be offline.; [console] Failed to preconnect to https://fonts.gstatic.com/. Error: The Internet connection appears to be offline.; [request] Failed to load resource: The Internet connection appears to be offline. (https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Sora:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght
- 2026-11-17T02:59:48Z · message_queued at 2026-11-17T02:59:48.108Z
- 2026-11-17T03:01:07Z · message_delivered: 1 message(s)
- 2026-11-17T03:17:59Z · body
- 2026-11-17T03:34:30Z · body
- 2026-11-17T03:37:32Z · note: ui verification passed: 2 of 2 shots captured with clean console (1 shot warning)
- 2026-11-17T03:37:32Z · status active→review
- 2026-11-17T03:37:33Z · message_queued at 2026-11-17T03:37:33.174Z
- 2026-11-17T03:47:48Z · note: review pass 1: needs some work
- 2026-11-17T03:47:48Z · message_delivered: 1 message(s)
