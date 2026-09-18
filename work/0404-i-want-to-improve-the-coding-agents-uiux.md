---
id: "0404"
title: "Improve coding agents UI/UX — single-line rows, sorted by status, and favorites"
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/improve-coding-agents-ui-ux-single-line-
created_at: "2026-09-18T05:30:42Z"
updated_at: "2026-09-18T06:58:52Z"
---
## Problem

The "Detected coding agents" tab has several usability issues:

1. Each agent row wraps onto a second line with unclear/extraneous text, making the list harder to scan. Cursor was cited as an example that shows unexpected extra text on a second line.
2. Agents are not sorted — installed/working agents and merely-supported agents are intermixed, making it hard to see at a glance what's usable.
3. There is no way to mark preferred agents as favorites, so the agent + model selector modal always surfaces the full list even when the user only ever uses two or three agents.

## Desired UX

- **Single-line rows.** Each detected coding agent fits on exactly one line. Any secondary text currently rendered below the agent name (version string, path, or status label) is either removed, moved inline, or collapsed so the row height stays consistent.
- **Sorted list: green first, then red.** Agents that are installed and working (green indicator) appear at the top of the list. Agents that are supported but not found / not working (red indicator) appear below. Within each group, preserve the existing ordering.
- **Star / favorite toggle.** A star icon appears on the right-hand side of each agent row (mirroring the favorite-theme behavior in Settings). Clicking it toggles the agent as a favorite. Starred agents are visually distinct (filled star vs outline).
- **Favorites filter in the agent + model selector modal.** If the user has starred at least one agent, the selector modal shows only favorited agents. If the user has starred none, the modal shows all available agents (existing behavior unchanged).

## Acceptance criteria

- [ ] Each row in the detected coding agents list occupies a single line with no text wrapping onto a second line.
- [ ] Any extraneous secondary text (e.g. the extra line visible under Cursor) is removed or consolidated into the single row.
- [ ] The detected agents list is sorted: installed/working (green) agents appear before supported-but-unavailable (red) agents.
- [ ] A star icon is rendered on the right side of every agent row in the detected agents list.
- [ ] Clicking the star toggles the favorite state; the icon visually distinguishes starred (filled) from unstarred (outline).
- [ ] Favorite state persists across page reloads (stored in `localStorage` or equivalent client-side storage).
- [ ] When at least one agent is starred, the agent + model selector modal displays only the starred agents.
- [ ] When no agents are starred, the agent + model selector modal displays all available agents (no behavior change from today).
- [ ] Existing functionality of the detected agents tab and the selector modal is otherwise unaffected.

## Notes for AI

- **Where to look:** The detected agents tab is rendered via `src/ui-app/src/views/` — grep `router.ts` for the agents path to find the right view file. The agent + model selector modal is likely a separate component; find it by searching for where the modal is triggered or for the `POST /api/tasks/:id/start` call.
- **Extraneous line:** The screenshot was not attached, so the exact extra text is unknown. Assumption: it is a secondary `<p>` or `<div>` rendering the agent's detected path or version string below the name. Make the row single-line by moving any useful metadata (e.g. version) into a secondary inline `<span>` styled as muted text next to the name, or removing it if it adds no value. Do not silently delete useful information without at least an inline label.
- **Sorting:** Use the existing green/red status indicator field (whatever boolean or status property distinguishes "installed" from "not found") as the sort key. Do not change the data source or API.
- **Favorites storage:** Follow the pattern used by favorite themes in Settings — use `localStorage` with a stable key. If themes use a composable or store, reuse the same pattern rather than rolling something new.
- **Favorites filter scope:** Only apply the favorites filter inside the agent + model selector modal. The detected agents list on the Agents page should always show all agents (both starred and unstarred), since it is a management surface.
- **Do not** change any server-side code or API endpoints — this is a UI-only change.
- After any UI changes, run `bun run build:ui` before marking the task ready for review.

## Scope

Covers: single-line rows, sort order, star/favorite toggle, favorites filter in the selector modal.

Deferred: bulk-favorite actions, syncing favorites across devices, any server-side persistence of favorites, reordering agents by drag-and-drop.

## Original prompt

I want to improve the coding agents UIUX. firstly each line in the "detected coding agents" tab should only be 1 line, see how cursor has some extraneous text on line 2 in the screenshot, I don't think that should be there, i'm not even sure what it means. Also let's sort the list of detected coding agents with those that are installed/working on the user's system and those that are supported, so it should be green then red. Also the user may not want to use all the available coding agents, so add a star on the right hand side of each coding agent row to make it a favorite (like the favorite themes behavior in settings). and if the user has selected favorites only show the favorites in the the coding agent + model selector modal. if the user hasn't selected favorites then you can keep showing all avialable in the modal

## Screenshots

![Screenshot-2026-09-18-at-13.27.33](/api/tasks/0404/attachments/screenshot-1.png)
![Screenshot-2026-09-18-at-12.52.57](/api/tasks/0404/attachments/screenshot-2.png)

## Activity

- 2026-09-18T05:30:42Z · created · hello@repoos.org
- 2026-09-18T05:30:43Z · screenshots
- 2026-09-18T05:30:43Z · screenshots
- 2026-09-18T05:31:10Z · status draft→inbox, title, area, body
- 2026-09-18T05:35:48Z · status inbox→ready
- 2026-09-18T05:35:52Z · status ready→active, branch
- 2026-09-18T05:41:54Z · status active→review
- 2026-09-18T06:58:52Z · status review→done, release:success
