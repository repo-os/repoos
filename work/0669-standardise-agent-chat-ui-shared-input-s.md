---
id: "0669"
title: "Standardise agent chat UI: shared input style, markdown replies, simplified headers with inline agent+model picker"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/standardise-agent-chat-ui-shared-input-s
created_at: "2026-10-05T15:01:24Z"
updated_at: "2026-10-07T17:06:48Z"
---
## Problem

The built-in agent chats (CTO, Debugger, Ross/RepoGuide, plus PM and the task drawer's Dev/Reviewer chats) each hand-roll their own input and header. Specific issues:

- CTO replies arrive as markdown but render raw (`**bold**`, `###`).
- The CTO input has no focus/active outline; the Debugger's does. Chat inputs differ across surfaces.
- Headers carry redundant subtitles ("Bug diagnostician", "CTO Board Monitor" / "CTO agent is active", "Repository assistant").
- Users can't see or change which coding agent + model a built-in agent uses without leaving for the Agents page.

## Desired UX

1. **Shared chat input.** One shared component or global class in `style.css` (no bespoke scoped styles) copying the active/focus style of the Dev and Reviewer chat in the task panel. Every chat surface uses it: CTO, Debugger, Task Debugger, Ross, PM, task drawer chats.
2. **Markdown rendering** for agent replies in the CTO chat, reusing the existing renderer other chats use. No new runtime dependency.
3. **Simplified headers** for Debugger, CTO and Ross: show only the name ("CTO", not "CTO Board Monitor"). Remove the subtitle line. Keep a disabled state indicator if the agent is off.
4. **Inline agent+model chip** next to the name, right-aligned beside the close button, roughly half the header width max (not a full row). Clicking it opens the same picker the task panel uses for PM/Engineer/Reviewer, so the user can change coding agent + model on the fly. Reuse that picker (see `AgentModelModal.vue` and how TaskDrawer wires roles); persist the same way the Agents page does.

## Acceptance criteria

- Every chat input renders identically and shows the same focus outline as the task panel Dev/Reviewer chat.
- CTO replies render headings, bold, lists, tables and code as markdown; no raw markdown tokens visible.
- Debugger, CTO and Ross headers show name + agent/model chip + close button only; chip is ~half width max, right-aligned.
- Clicking the chip changes agent+model and the change takes effect for the next turn and persists.
- Following AGENTS.md conventions: styled dropdown/popover, no native select/title tooltip, body-teleported overlays carry `data-overlay-layer`, tests added, UI rebuilt.
- Declared `## Shots` for the CTO, Debugger and Ross panels.

## Notes for AI

Grep targets: `components/CTOPanel.vue`, `DebuggerChat.vue`, `TaskDebuggerChat.vue`, `RepoGuideChat.vue`, `PmChatSurface.vue`, `TaskDrawer.vue`, `AgentModelModal.vue`. Contrast audit and CSS layering guards apply to any style change.

## Activity

- 2026-10-05T15:01:24Z · created · unknown
- 2026-10-05T22:32:55Z · status inbox→ready
- 2026-10-07T17:06:44Z · status ready→active, branch
