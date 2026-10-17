---
id: "0819"
title: "Easter eggs bundle: shot warnings, viewer status, and bird tracks"
type: bug
status: ready
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-17T12:52:42Z"
updated_at: "2026-10-17T15:06:34Z"
---
## Problem
Three small items, one open easter-eggs bundle:
1. When a change touches documentation, the handoff capture tries the Docs site preview target. If no declared shot names a docs route, the target is skipped, and the Changes tab shows '[shot-warning] declared shot not captured — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped'. The wording is hard to act on. The screenshot viewer also shows only the image, not the green check or the warning, so the status is hidden when you open a shot.
2. Test coverage for #0817's Update requirements flow is missing for two entry points. The notice to the engineer must fire when the body is saved through the spec form, and when the task file is edited by hand (the file watcher path), not only through the Update requirements dialog.
3. Settings saves auto-commit repoos.toml to main (src/server/routes/config.ts, commitConfigWrite, 'chore(config): update repoos.toml'). Each slider step commits to main, and each commit makes an in-flight close-out restart ('main drifted during publish — resyncing'). Background: #0682 added this auto-commit so that a settings save would not leave main dirty and block Move to done until someone committed by hand. Remove the auto-commit: the save writes repoos.toml to disk only. The Move to done dirty-main check (src/server/routes/tasks.ts, the dirty-main guard, and 'Commit & continue') then asks the user to commit the settings file before the close-out starts, instead of every save committing.

## Desired UX
- Item 1: the skipped docs warning reads 'Docs site skipped: no docs shot declared', with a short link that explains how to declare a docs route for the task. The screenshot viewer header shows the shot's check (or cross) and any warning for that shot, the same as the row in the Changes list.
- Item 2: no change in behaviour; new tests lock in the existing behaviour for the two paths.
- Item 3: a Settings save changes repoos.toml on disk only, with no commit to main. A repoos.toml change left uncommitted shows in the Move to done dirty-main prompt ('Commit & continue'), the same as any other dirty file. Close-out does not restart because of a settings save.

## Acceptance criteria
- Test: a docs-only change with no declared docs shot shows the new warning text and the declare link.
- Test: the screenshot viewer shows the shot's check and warning in its header.
- Test: saving the body through the spec form on an active task sends the engineer one requirements notice with the changed sections.
- Test: editing the task file by hand on an active task sends the engineer the same notice (file-watcher path).
- Test: a settings save writes repoos.toml and makes no commit (git log on main unchanged).
- Test: Move to done with an uncommitted repoos.toml shows the dirty-main prompt rather than silently committing or starting the close-out.
- Light and dark themes checked on the warning and the viewer header.

## Notes for AI
Start from the shot-warning text in the handoff capture code (grep for 'docs captures need a declared route') and the screenshot viewer (grep for 'Wider images scale down'). For item 2, see the requirements notifier and the LiveIndex body-change hook on the #0817 work (src/server/requirements-notice.ts, src/server/live-index.ts). For item 3, see commitConfigWrite in src/server/routes/config.ts and the dirty-main guard in src/server/routes/tasks.ts and src/core/git.ts (mainDirtyFilesForCloseOut). Keep the #0682 intent: a settings save must not leave main in a state that blocks Move to done silently. Source: user reports 2026-10-17.

## Screenshots

![Approved bird-track shape reference: tapered central toe, splayed side toes, and short heel](/api/tasks/0819/attachments/screenshot-1.png)

## Activity

- 2026-10-17T12:52:42Z · created · njachowski@gmail.com
- 2026-10-17T12:52:46Z · status inbox→ready
- 2026-10-17T13:17:57Z · title, body: section Bird quick trail animation (third bundle item)
- 2026-10-17T13:17:57Z · screenshots
- 2026-10-17T14:04:33Z · body
- 2026-10-17T15:06:34Z · body: Problem (added 2, removed 1); Desired UX (added 1); Acceptance criteria (added 2); Notes for AI (added 1, removed 1)
