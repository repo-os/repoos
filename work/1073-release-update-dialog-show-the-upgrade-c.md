---
id: "1073"
title: "Release update dialog: show the upgrade command (copyable) next to the release link"
type: feature
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-09T05:50:38Z"
updated_at: "2026-11-09T05:50:38Z"
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

## Screenshots

![Update banner: RepoOS 0.5.79 is ready](/api/tasks/1073/attachments/att_b0660367-12b4-4966-a9f2-e46d4de77e1d.png)
![Update dialog: the Upgrade button only opens the GitHub release page](/api/tasks/1073/attachments/att_8663ea38-382c-4aae-9dff-914eaae925f8.png)

## Activity

- 2026-11-09T05:50:38Z · created · njachowski@gmail.com
- 2026-11-09T05:50:38Z · screenshots
