---
id: 1030
title: Full-width dirty-main button in sidebar that opens a commit panel
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/full-width-dirty-main-button-in-sidebar-
cli_override: opencode
model_override: opencode-go/glm-5.3-flash
created_at: "2026-11-04T10:30:51Z"
updated_at: "2026-11-04T14:00:19Z"
dev_error_count: 3
engineer_failover: "{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\"}"
---
when main is dirty it's hard for the user to notice now (because it's just a small yellow text), if it's dirty let's add a yellow button on the line below taht fills the full widdth, which when clicked opens a change right sidebar, similar to the task changes tab, so the user can easily see the changes with a single click, from that new dirty change side panel (keep styling,width the same as all the other right side panels btw) there should be a commit button and text area at the bottom for the user to easily commit with a single click there)

## Original prompt

when main is dirty it's hard for the user to notice now (because it's just a small yellow text), if it's dirty let's add a yellow button on the line below taht fills the full widdth, which when clicked opens a change right sidebar, similar to the task changes tab, so the user can easily see the changes with a single click, from that new dirty change side panel (keep styling,width the same as all the other right side panels btw) there should be a commit button and text area at the bottom for the user to easily commit with a single click there)

## Problem

The only signal that `main` has uncommitted changes is a tiny 10px amber mono chip
(`side-git-state.warn`, `.side-git-state.warn` → `var(--amber)` in `src/ui-app/src/style.css`
~line 885) at the bottom of the left sidebar, rendered by
`src/ui-app/src/components/SidebarGitState.vue` and mounted in `src/ui-app/src/components/Sidebar.vue:11`.
It reads like `dirty 3` — easy to miss entirely.

Dirty `main` matters: it blocks close-outs (the landable check requires "no blocking dirty files"
on main), makes `repoos done` refuse with "main has N uncommitted file(s) blocking close-out",
and risks agents/license copies of human work sitting half-committed. #0204 surfaced dirty files
at move-to-done time, but by then the close-out is already blocked. Seeing and fixing dirty main
should be one click, from the sidebar itself.

The journey today is buried: hover the small ⓘ button in `SidebarGitState` → popover →
"View diff" link to `/repo/working-diff`, with commit only offered through `CommitDialog.vue`
inside the same popover. Nothing about that invites "let me deal with it now".

Screenshots show the current chip (`Screenshot-2026-11-04-at-17.43.22`), the buried popover access
(`...17.45.29`), and where the affordance should sit (`...18.07.51`).

## Desired UX

When the repo status says main is dirty, a full-width amber button appears in the left sidebar
directly below the existing branch/status row ("N uncommitted change(s) — branch-name"). With a
clean main the button is not rendered. Clicking it opens a right-side panel — same width and
styling as every other right panel (the shared `drawerWidth` drawer, default 680px, resizable;
`drawer-resize` / `drawer-head` / `drawer-body` scaffolding) — listing the dirty files and showing
the working-tree diff inline, like the task drawer's Changes tab. At the bottom of the panel there
is a commit-message textarea and a single Commit button; one click commits all uncommitted changes
on main and the panel and sidebar chip both update immediately.

## Acceptance criteria

1. With a clean main, the dirty-changes button is not rendered at all (the existing
`SidebarGitState` clean/unknown states behave as today; no empty commit shell).
2. With `N` dirty files on main, a full-width amber button appears in the left sidebar directly
below the branch/`side-git-state` row, labeled with the count (e.g. "3 uncommitted changes").
3. Clicking the button opens a right-side panel that shares the global drawer width and styling
(same `drawerWidth` value and `drawer-head`/`drawer-body` scaffolding as TaskDrawer /
RemindersPanel — no bespoke second width system), is resizable, and closes like the others.
4. The panel lists every dirty file from `GET /api/repo/status` (added, modified, deleted; count
matches the sidebar chip) and renders the working-tree diff inline per file, equivalent to
what `/repo/working-diff` shows, without a full route change.
5. The bottom of the panel has a commit-message textarea and a Commit button; an empty message
commits with the server default ("chore: commit uncommitted changes"), the button is disabled
while a commit is in flight, and clicking it commits all uncommitted changes via the existing
`POST /api/repo/commit` (no selective staging in this pass).
6. Commit failures surface inline in the panel with a readable message, including the 409 paths
(nothing to commit, unresolved conflicts, detached HEAD, pending close-out) and 422 with the
verbatim pre-commit hook output — never a silent failure or console-only error.
7. After a successful commit, the file list and diff empty, the bottom controls reset/disable,
and the sidebar chip returns to `clean` without a reload (porcelain store state from the
existing `repo.status` SSE update is enough).
8. The panel renders correctly in both light and dark themes with no hardcoded colors (guards:
`hardcoded-colors`, contrast audit), and the code passes `repoos check` including the UI
smoke test.

## Notes for AI

- Data already exists: the store reuses `gitStatus` from `src/ui-app/src/stores/repo.ts`
(~line 758; fetched from `GET /api/repo/status`, refreshed by SSE `repo.status` with a
dirty-transition debounce around lines 2275-2325). Subscribe rather than re-fetch.
- Sidebar changes go in `src/ui-app/src/components/SidebarGitState.vue` (extend it, or add a
child component it renders when `dirtyCount > 0`) and its mount point
`src/ui-app/src/components/Sidebar.vue:11`. Keep the existing ⓘ popover working.
- Right panel: follow the shared drawer pattern from the UI store — `drawerWidth`
(`src/ui-app/src/stores/ui.ts:69`, default 680px, `startResize`) and the
`drawer-resize`/`drawer-head`/`drawer-body` classes used by `TaskDrawer.vue:4671`,
`RemindersPanel.vue:204`, etc. The panel lives in the app layout column (no Teleport needed
for the panel itself), but any modal/scrim bits must follow the `data-overlay-layer` rule.
- Point conventions that apply: styled dropdowns for any selection, shared dialog components for
confirmations (never native `alert`/`confirm`), `.main` sizing and `.kv-rows` utilities where
relevant. Rebuild with `bun run build:ui` after the change.
- Diff rendering: preference order — reuse `DiffFileViewer.vue` exactly as TaskDrawer's Changes
tab does (particularly the call-site at `TaskDrawer.vue:7091`), with `DiffView.vue`
(`/repo/working-diff`) kept as the full-screen escape. Working-tree patch data for the repo
root may need a small read-only server route in `src/server/routes/repo-log.ts` alongside
`GET /api/repo/status`; keep it read-only.
- Committing: reuse `POST /api/repo/commit` (`repo-log.ts` `commitRepoRoot`): it stages
everything and commits all uncommitted changes on the current branch, and the human's click is
the authorization for human-only commits (agents never call it). Respect its guards: 409
nothing-to-commit / conflicts / detached HEAD / pending close-out, 422 hook rejection with
verbatim output. Do not add selective file staging; that is a different scope.
- There is already a `CommitDialog.vue` reachable from the popover. Prefer reusing that flow or
its server semantics so the app has one commit UX; do not fork a second commit pipeline.
- Tests: component tests near `src/ui-app/tests/` — button render across clean/dirty/unknown
states, panel open/close with shared width, commit success/error paths with the store mocked
(use fakes; do not phrase anything around real credentials). Add captions via
`repoos update 1030 --shots '<json>'` at handoff and rebuild so the preview serves the button.

## Shots
```json
[
{
"label": "Dirty-main sidebar button",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"side-git-dirty\"]",
"state": "repo:dirtyMain"
},
{
"label": "Uncommitted-changes panel open from the button",
"target": "default",
"route": "/",
"highlight": "[data-testid=\"repo-dirty-panel\"]",
"steps": [
{
"click": "[data-test-id=\"side-git-dirty\"]"
},
{
"waitMs": 400
}
],
"state": "repo:dirtyMain"
}
]
```

## Screenshots

![Screenshot-2026-11-04-at-17.43.22](/api/tasks/1030/attachments/att_3f784343-fc8e-4acb-8db8-aaa9caa78ced.png)
![Screenshot-2026-11-04-at-17.45.29](/api/tasks/1030/attachments/att_b38279eb-7746-41c4-ace8-cbf8287fa894.png)
![Screenshot-2026-11-04-at-18.07.51](/api/tasks/1030/attachments/att_cd970a2b-d267-4044-afb0-a0c76f1b814d.png)

## Activity

- 2026-11-04T10:30:51Z · created · hello@repoos.org
- 2026-11-04T10:30:58Z · screenshots
- 2026-11-04T10:30:58Z · screenshots
- 2026-11-04T10:30:59Z · screenshots
- 2026-11-04T10:35:47Z · note: Freeform PM run failed: the opencode agent timed out after 180s
- 2026-11-04T10:35:48Z · needs_input
- 2026-11-04T10:36:57Z · needs_input
- 2026-11-04T10:42:24Z · area
- 2026-11-04T10:42:29Z · body: Problem (added)
- 2026-11-04T10:42:33Z · body: Desired UX (added)
- 2026-11-04T10:42:39Z · body: Acceptance criteria (added)
- 2026-11-04T10:42:44Z · body: Notes for AI (added)
- 2026-11-04T12:02:28Z · title
- 2026-11-04T12:02:30Z · status draft→inbox
- 2026-11-04T12:37:46Z · status inbox→ready
- 2026-11-04T12:58:34Z · status ready→active, branch
- 2026-11-04T13:11:11Z · message_queued at 2026-11-04T13:11:11.788Z
- 2026-11-04T13:11:11Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T13:14:18Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T13:22:58Z · body
- 2026-11-04T13:27:46Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T13:27:46Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T13:27:53Z · needs_input
- 2026-11-04T13:27:53Z · message_delivered: 1 message(s)
- 2026-11-04T13:29:07Z · body
- 2026-11-04T13:34:30Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T13:34:30Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T13:34:51Z · needs_input
- 2026-11-04T13:35:15Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T13:35:15Z · engineer crash recovery: switched opencode + opencode-go/deepseek-v4.1-flash → opencode + opencode-go/glm-5.3-flash after 3/3 crashes in 30m · the agent process exited with an error — open the task to see the full output
- 2026-11-04T13:35:39Z · needs_input
- 2026-11-04T13:37:01Z · body
- 2026-11-04T13:39:00Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-04T13:41:27Z · body
- 2026-11-04T13:41:53Z · body
- 2026-11-04T13:54:47Z · body
- 2026-11-04T14:00:19Z · body
