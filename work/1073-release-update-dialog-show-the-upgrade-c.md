---
id: "1073"
title: "Release update dialog: show the upgrade command (copyable) next to the release link"
type: feature
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/release-update-dialog-show-the-upgrade-c
cli_override: opencode
model_override: deepinfra/deepseek-ai/DeepSeek-V4.1-Flash
created_at: "2026-11-09T05:50:38Z"
updated_at: "2026-11-09T14:13:25Z"
handoff_signal_retry_count: 2
dev_error_count: 4
---
## Problem
The dashboard already tells users when a newer RepoOS is available (`ReleaseUpdateNotification.vue`, data from `GET /api/release/available`): a banner, then a dialog with installed vs available version and the release notes. But the dialog's only action is an "Upgrade" button that just opens the GitHub release page. It never says how to actually upgrade, even though the answer is a single command.

## Desired UX
- In the dialog, under the version comparison (or just above the buttons), show a short "How to upgrade" block with the command in a code block and a Copy button: `repoos upgrade`.
- The command depends on how this RepoOS was installed (the same detection `repoos upgrade` uses, `src/commands/upgrade.ts`): standalone/curl-installed builds show `repoos upgrade`; package-manager or source-checkout installs show the matching instruction (for example the package manager's update command, or `git pull && bun install && bun run build`), never a command that would not work for that install.
- Users on a beta/canary/rc channel see the channel form (`repoos upgrade --channel <name>`).
- Keep the existing button, relabelled "Release notes" (it opens the GitHub release), so "Upgrade" is no longer a misleading label for a link; the code block is the upgrade action. Add a one-line note that the upgrade runs in a terminal and a running server restarts afterwards (state what actually happens, check `upgrade.ts`).
- Copy gives clear feedback ("Copied") and works by keyboard; uses the shared styled components, no native tooltips or `title`.

## Acceptance criteria
1. The server returns the correct upgrade command and install kind in `GET /api/release/available` (new field, for example `upgradeCommand` and `installKind`), computed with the same detection as `repoos upgrade`; unit tests for standalone, package-manager, source checkout and channel cases.
2. The dialog shows the command in a code block with a working Copy button; test for render and copy (fake clipboard).
3. The old button is relabelled and still links to the release URL; the banner copy ("See what's new and upgrade when it suits you") stays accurate.
4. Dismissal currently lives only in memory (`dismissed = ref(false)`), so the banner returns on every page load; remember the dismissed version in localStorage (wrapped in try/catch) so it stays dismissed until a newer version appears. Include this as a small fix if it fits; otherwise note it in the report.
5. Declared shots (state fixture) of the dialog with the command block in light and dark themes.
6. Docs updated where the dialog is described (user-docs).

## Notes for AI
Files: `src/ui-app/src/components/ReleaseUpdateNotification.vue`, the `/api/release/available` handler in `src/server`, `src/commands/upgrade.ts` (install-kind detection and the per-source instructions). Check that the command text matches what `repoos upgrade` prints today. Do not edit repoos.toml.

## Scope boundary with #1072
This task owns the install-kind detection and the upgrade command text (server: installKind and upgradeCommand on GET /api/release/available, as a reusable helper in src/commands/upgrade.ts or a small module) and the dismissed-version persistence. #1072 (CLI notice and Settings toggle) will reuse that helper, so expose it as a plain exported function with tests, not as UI-only code.

## Shots
```json
[
{
"label": "Update dialog: upgrade command block (light)",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"release-upgrade-command\"]",
"state": "release:updateAvailable",
"theme": "light"
},
{
"label": "Update dialog: upgrade command block (dark)",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"release-upgrade-command\"]",
"state": "release:updateAvailable",
"theme": "dark"
}
]
```

## Screenshots

![Update banner: RepoOS 0.5.79 is ready](/api/tasks/1073/attachments/att_b0660367-12b4-4966-a9f2-e46d4de77e1d.png)
![Update dialog: the Upgrade button only opens the GitHub release page](/api/tasks/1073/attachments/att_8663ea38-382c-4aae-9dff-914eaae925f8.png)

## Activity

- 2026-11-09T05:50:38Z · created · njachowski@gmail.com
- 2026-11-09T05:50:38Z · screenshots
- 2026-11-09T07:50:36Z · body: Scope boundary with #1072 (added)
- 2026-11-09T09:08:06Z · cli_override, model_override
- 2026-11-09T09:08:17Z · status inbox→ready
- 2026-11-09T09:08:18Z · status ready→active, branch
- 2026-11-09T09:11:35Z · model_override
- 2026-11-09T09:16:50Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T09:16:50Z · engineer crash recovery: surfaced instead of switching — a human-set task override (opencode + opencode-go/deepseek-v4.1-flash) is pinned, so RepoOS did not replace it (1/3 crashes in 30m)
- 2026-11-09T09:26:50Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-09T09:28:32Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T09:28:32Z · engineer crash recovery: resuming opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T09:29:56Z · needs_input
- 2026-11-09T09:31:26Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T09:31:26Z · engineer crash recovery: resuming opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash (2/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T09:38:39Z · needs_input
- 2026-11-09T09:38:43Z · engineer stopped by request
- 2026-11-09T09:38:43Z · held, held-reason, held-at
- 2026-11-09T09:48:41Z · body
- 2026-11-09T10:16:58Z · body
- 2026-11-09T10:43:19Z · body
- 2026-11-09T13:15:56Z · released
- 2026-11-09T13:26:55Z · message_queued at 2026-11-09T13:26:55.716Z
- 2026-11-09T13:26:55Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-09T13:31:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T13:33:42Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'll stop polling and wait for the automatic completion notification. Summary of where things stand: - The worktree already contained the full implementation for #1073 from a prior session (2 WIP commits), but the branch was **375 commits … · stderr: (empty)
- 2026-11-09T13:38:49Z · message_queued at 2026-11-09T13:38:49.873Z
- 2026-11-09T13:47:19Z · message_queued at 2026-11-09T13:47:19.920Z
- 2026-11-09T13:52:32Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-09T13:52:32Z · note: handoff requested (cli)
- 2026-11-09T13:56:55Z · CTO nudge: held — handoff gate is running
- 2026-11-09T13:57:10Z · message_delivered: 1 message(s)
- 2026-11-09T13:58:38Z · body
- 2026-11-09T14:01:35Z · agent exited with an error (opencode) · handoff finalization was interrupted (server reload) — restart work to hand off again. If the conversation is poisoned (the same failure repeats every turn), reset it with `repoos start <id> --fresh`
- 2026-11-09T14:07:33Z · note: ui verification failed: ui verification failed (4 issue(s)): [missing-target] Update dialog: upgrade command block (light) (target "default"): state "release:updateAvailable" did not render on target "default" — / has no open drawer/dialog (declare the route that opens it, e.g. /work?task=9999&tab=changes) (http://127.0.0.1:44467/?shotState=release%3AupdateAvailable); [missing-target] Update dialog: upgrade command block (light) (target "default"): highlight [data-test-id="release-upgrade-comman
- 2026-11-09T14:07:33Z · message_queued at 2026-11-09T14:07:33.633Z
- 2026-11-09T14:07:33Z · handoff failed · task-file handoff failed at verify · ui verification failed (4 issue(s)): [missing-target] Update dialog: upgrade command block (light) (target "default"): state "release:updateAvailable" did not render on target "default" — / has no open drawer/dialog (declare the route that opens it, e.g. /work?task=9999&tab=changes) (http://127.0.0.1:44467/?shotState=release%3AupdateAvailable); [missing-target] Update dialog: upgrade command block (light) (target "default"): highlight [data-test-id="release-upgrade-command"] matched nothing on / (http://127.0.0.1:44467/?shotState=release%3AupdateAvailable); [missing-target] Update dialog: upgrade command block (dark) (target "default"): state "release:updateAvailable" did not render on target "default" — / has no open drawer/dialog (declare the route that opens it, e.g. /work?task=9999&tab=changes) (http://127.0.0.1:44467/?shotState=release%3AupdateAvailable); [missing-target] Update dialog: upgrade command block (dark) (target "default"): highlight [data-test-id="release-upgrade-command"] matched nothing on / (http://127.0.0.1:44467/?shotState=release%3AupdateAvailable)
- 2026-11-09T14:09:09Z · needs_input
- 2026-11-09T14:09:09Z · message_delivered: 3 message(s)
- 2026-11-09T14:13:25Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Now, there's still a risk: `DialogContent` uses Radix; `role="dialog"` may only appear after the transition/animation mounts. The shot probe runs after the page settles. But the previous attempt did apply the fixture (the attribute matched… · stderr: (empty)
