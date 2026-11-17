---
id: "1126"
title: "Releases: 'Generate AI notes and publish' - let the user choose auto-publish or notify-me when the AI draft is ready"
type: feature
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "Automatic recovery could not restart the engineer: This worktree already has a recorded live engineer for task #1126 (pid 57100)"
priority: p2
area: [web, server]
assigned_to: ai
created_by: t@t
branch: feat/releases-generate-ai-notes-and-publish-l
created_at: "2026-11-15T08:14:22Z"
updated_at: "2026-11-17T00:41:22Z"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-11-17T00:29:34.833Z\",\"kind\":\"dev-error\"}]"
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
"label": "Generate with AI opens the when-ready chooser",
"target": "default",
"route": "/releases?drawer=cut",
"selector": "[data-test-id=\"release-generate-notes\"]",
"highlight": ".rel-whenready",
"steps": [
{
"click": "[data-test-id=\"release-generate-notes\"]"
},
{
"waitMs": 400
}
]
},
{
"label": "Generate notes and publish shortcut in the release panel",
"target": "default",
"route": "/releases?drawer=cut",
"highlight": "[data-test-id=\"release-generate-and-publish\"]"
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
