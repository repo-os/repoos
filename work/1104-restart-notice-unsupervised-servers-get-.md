---
id: "1104"
title: "Restart notice: unsupervised servers get a copy-command button, and it ignores an in-flight release bump"
type: feature
status: inbox
priority: p3
area: [web, server]
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-14T02:26:21Z"
updated_at: "2026-11-14T02:32:24Z"
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

## Notes for AI
Small, p3, easter-egg sized. Start from `src/ui-app/src/components/ReleaseUpdateNotification.vue` and the restart status the server returns (`restartStatus.supervised`, `manualCommand`).

## Styling alignment
The restart notice (a floating banner, not a dialog) uses bespoke scoped CSS: 12px/11px hard-coded font sizes and 9px 11px padding in a 430px card with a violet tint. Standard dialogs and drawers use the shared shell (head 18px 22px, body 20px 22px, DialogTitle at 18px bold, width up to 560px). Decide whether it stays a compact toast (then use the toast tokens and match other toasts) or becomes a real dialog on the shared components, and remove the hard-coded px sizes either way. Add as acceptance criterion 5.

## Activity

- 2026-11-14T02:26:21Z · created · t@t
- 2026-11-14T02:32:24Z · body: Styling alignment (added)
