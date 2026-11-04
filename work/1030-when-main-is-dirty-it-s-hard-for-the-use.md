---
id: 1030
title: when main is dirty it's hard for the user to notice now (…
type: feature
status: draft
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-11-04T10:30:51Z"
updated_at: "2026-11-04T10:42:33Z"
---
when main is dirty it's hard for the user to notice now (because it's just a small yellow text), if it's dirty let's add a yellow button on the line below taht fills the full widdth, which when clicked opens a change right sidebar, similar to the task changes tab, so the user can easily see the changes with a single click, from that new dirty change side panel (keep styling,width the same as all the other right side panels btw) there should be a commit button and text area at the bottom for the user to easily commit with a single click there)

## Original prompt

when main is dirty it's hard for the user to notice now (because it's just a small yellow text), if it's dirty let's add a yellow button on the line below taht fills the full widdth, which when clicked opens a change right sidebar, similar to the task changes tab, so the user can easily see the changes with a single click, from that new dirty change side panel (keep styling,width the same as all the other right side panels btw) there should be a commit button and text area at the bottom for the user to easily commit with a single click there)

## Screenshots

![Screenshot-2026-11-04-at-17.43.22](/api/tasks/1030/attachments/att_3f784343-fc8e-4acb-8db8-aaa9caa78ced.png)
![Screenshot-2026-11-04-at-17.45.29](/api/tasks/1030/attachments/att_b38279eb-7746-41c4-ace8-cbf8287fa894.png)
![Screenshot-2026-11-04-at-18.07.51](/api/tasks/1030/attachments/att_cd970a2b-d267-4044-afb0-a0c76f1b814d.png)

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
