---
id: "1104"
title: "Restart notice: unsupervised servers get a copy-command button, and it ignores an in-flight release bump"
type: feature
status: active
priority: p3
area: [web, server]
assigned_to: ai
created_by: t@t
branch: feat/restart-notice-unsupervised-servers-get-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T02:26:21Z"
updated_at: "2026-11-14T04:00:24Z"
review_rounds: 1
review_passes: 1
---
## Problem
Two rough edges in the "RepoOS vX is installed" restart notice (#1075, `ReleaseUpdateNotification.vue`):
1. When the server is not supervised (hand-run `just serve`), Restart now and Restart when idle are shown greyed out and unclickable, next to a hint to run a launchctl command by hand. Dead buttons look broken.
2. During a release cut, the temporary `release: vX` version bump makes the notice announce "vX is installed" before the tag exists. If the release then fails and rolls back, the notice was wrong.

## Desired UX
1. For an unsupervised server, replace the two disabled buttons with one "Copy restart command" button that copies the command shown in the hint (use the shared copy pattern from the update modal), with a short confirmation. Supervised servers keep Restart now and Restart when idle unchanged.
2. The notice only appears once the installed version is a published release, not while a release run is in the `committing`, `building`, `checking` or `tagging` phase (read `GET /api/release/run`) or when the tag does not exist yet.

## Acceptance criteria
1. Unsupervised: no disabled Restart buttons; the copy button copies `manualCommand` and shows confirmation; a component test covers it.
2. During a running or failed-and-rolled-back release, the notice does not claim the bumped version; a test covers the running phase.
3. Supervised behavior and the existing restart-notice tests still pass.
4. UI follows AGENTS.md conventions (no native tooltips or dialogs).
5. The restart notice uses shared dialog classes, with dismiss, Escape and focus behavior matching other dialogs.
6. In the newer-release modal, the modal is a flex column and only the release-notes section scrolls; a test asserts the scroll containment.
7. Release-note paragraphs and list items retain visible spacing and list bullets.

## Notes for AI
Small, p3, easter-egg sized. Start from `src/ui-app/src/components/ReleaseUpdateNotification.vue` and the restart status the server returns (`restartStatus.supervised`, `manualCommand`).

## Styling alignment
Decision (Nick): the restart notice becomes a real dialog built on the shared dialog components (DialogContent/DialogTitle/DialogDescription, .am-modal shell, standard head/body padding and type scale), not a toast. It carries too much content for a toast: version, running version, work counts, #0214 link, restart actions and the unsupervised hint. Toasts stay for short, simple notifications. Remove the bespoke banner CSS and hard-coded px font sizes. Add as acceptance criterion 5: it renders with the shared dialog classes, and the dismiss/Escape/focus behaviour matches other dialogs.

## Shots
```json
[
{
"label": "Installed release restart dialog",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"installed-restart-notice\"]",
"state": "release:restartPendingLight"
}
]
```

## Activity

- 2026-11-14T02:26:21Z · created · t@t
- 2026-11-14T02:32:24Z · body: Styling alignment (added)
- 2026-11-14T02:43:03Z · body: Styling alignment (added 1, removed 1)
- 2026-11-14T03:28:39Z · cli_override, model_override
- 2026-11-14T03:28:50Z · status inbox→ready
- 2026-11-14T03:28:52Z · status ready→active, branch
- 2026-11-14T03:29:16Z · message_queued at 2026-11-14T03:29:16.905Z
- 2026-11-14T03:31:14Z · body
- 2026-11-14T03:32:05Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-14T03:34:49Z · body
- 2026-11-14T03:37:29Z · body
- 2026-11-14T03:41:52Z · body
- 2026-11-14T03:45:27Z · body
- 2026-11-14T03:46:10Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-14T03:46:10Z · message_queued at 2026-11-14T03:46:10.287Z
- 2026-11-14T03:46:10Z · ↻ resuming engineer to read queued message
- 2026-11-14T03:46:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The new component coverage now passes locally: it verifies the exact manual command reaches the clipboard and the button confirms success, and that a `building` release run suppresses the installed notice. The required RepoOS check is vali… · stderr: Reading additional input from stdin... 2026-11-14T03:30:12.452831Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/restart-notice-unsupervised-servers-get-/src/ui-app/src/components/ReleaseUpdateNotification.vue: manua…
- 2026-11-14T03:46:10Z · message_delivered: 2 message(s)
- 2026-11-14T03:47:42Z · body: Acceptance criteria (added 3)
- 2026-11-14T03:47:43Z · message_queued at 2026-11-14T03:47:43.050Z
- 2026-11-14T03:50:26Z · body
- 2026-11-14T03:51:05Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-14T03:51:05Z · message_queued at 2026-11-14T03:51:05.613Z
- 2026-11-14T03:51:05Z · ↻ resuming engineer to read queued message
- 2026-11-14T03:51:05Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I’ll add the modal scroll containment and release-note list spacing, update task #1104’s acceptance criteria through RepoOS, add a focused assertion, and rerun the scoped check before requesting handoff again. · stderr: (empty)
- 2026-11-14T03:51:05Z · message_delivered: 2 message(s)
- 2026-11-14T03:52:05Z · CTO nudge: held — handoff gate is running
- 2026-11-14T03:54:49Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-14T03:54:50Z · status active→review
- 2026-11-14T03:54:50Z · message_queued at 2026-11-14T03:54:50.747Z
- 2026-11-14T03:55:49Z · note: review pass 1: needs some work
- 2026-11-14T03:55:49Z · message_delivered: 1 message(s)
- 2026-11-14T03:55:49Z · status review→active
- 2026-11-14T03:55:51Z · CTO nudge: held — remote validation is running
- 2026-11-14T04:00:24Z · body
