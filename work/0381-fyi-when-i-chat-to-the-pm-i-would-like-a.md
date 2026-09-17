---
id: "0381"
title: Show PM-working indicators on task card and task panel
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
model_override: opencode-go/hy3
created_at: "2026-09-17T05:13:21Z"
updated_at: "2026-09-17T05:16:08Z"
---
## Problem

When the PM agent is working — e.g. processing a chat message that creates or updates a task — nothing on the board or the task panel shows it. The only way to see the PM in action is to already know it's doing something and click into the PM tab. PM activity is easy to miss, and tasks the PM creates feel like they came from nowhere.

## Desired UX

- While the PM is processing a chat run that touches a task, that task's card on the board shows a clear visual indicator (e.g. a pulsing dot or "PM working…" badge) that the PM is active on it.
- The task panel also shows an indicator that the PM is doing something, visible without opening the PM tab.
- Both indicators clear automatically when the PM run finishes, success or failure.
- Screenshots attached to a chat message end up on the task the PM creates from that message, so the visual context lives on the task itself.

## Acceptance criteria

- [ ] A task card shows a visible PM-active indicator while a PM run for that task is in progress
- [ ] The task panel shows the "PM is working" state without the user opening the PM tab
- [ ] Indicators clear when the run completes or errors
- [ ] A user watching the board can tell the PM is active without clicking into the PM tab
- [ ] Images attached to the chat input that spawns a task are included in / attached to the created task and viewable from it

## Notes for AI

- Assumption: "task card" = the card on the board; "task panel" = the task detail drawer/panel. Follow the codebase's own naming if it differs.
- Assumption: indicator styling is unspecified — reuse however busy/running agent state is already signalled in the UI rather than inventing a new visual language.
- This is UI + state-plumbing only: do not change what the PM agent does, how runs are spawned, or how activity is recorded. The PM run state likely needs to be observable from the board/task-panel layer — check what the server already exposes (SSE/API) before adding anything new.
- Attachments live under `work/.attachments/` (gitignored, served from disk); the task `.md` references them, never embeds pixels. Keep that convention — never `git add` the images.
- UI sitemap: routes in `src/ui-app/src/router.ts`, views in `src/ui-app/src/views/*View.vue`; body-teleported dialog CSS goes in `src/ui-app/src/style.css`, not scoped blocks. Rebuild (`bun run build:ui` or `bun run build`) after any UI change.

## Scope

Covers: PM-active indicator on board task cards, PM-active indicator on the task panel, and chat-input screenshots being carried onto the task the PM creates.

Deferred: any change to PM agent behavior, run scheduling, or the PM tab itself beyond exposing its running state.

## Original prompt

FYI when I chat to the PM I would like a visual indicator on the task card that the PM is working, also it would be useful to show some indicator on the task panel too that the PM is doing something, because otherwise you need to just know that the PM is doing something and click into the PM tab to see it. Also I hope these screenshots get included in the created task from this input.

## Activity

- 2026-09-17T05:13:21Z · created · hello@repoos.org
- 2026-09-17T05:14:52Z · status draft→inbox, title, area, body
- 2026-09-17T05:16:08Z · model_override
