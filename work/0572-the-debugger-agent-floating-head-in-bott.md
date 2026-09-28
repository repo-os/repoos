---
id: "0572"
title: Fix Debugger floating panel close behavior
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-debugger-floating-panel-close-behavi
created_at: "2026-09-28T07:20:34Z"
updated_at: "2026-09-28T08:10:00Z"
---
## Problem

The Debugger agent is opened from the floating head control in the bottom-right of the web UI. Once the panel is open, the user cannot dismiss it: clicking the backdrop and clicking the close (X) control have no effect. The panel stays open and blocks normal interaction with the page behind it.

## Desired UX

Closing the Debugger panel should match the other floating-head agents (CTO, Ross): backdrop click dismisses the panel, the header close control dismisses it, and the floating head button toggles open/closed. After close, the Debugger head returns to its idle state and the rest of the UI is usable again.

## Acceptance criteria

- [ ] With the Debugger floating panel open, clicking the dimmed backdrop closes the panel.
- [ ] With the Debugger floating panel open, clicking the X (close) control in the panel header closes the panel.
- [ ] After either close action, the panel is not visible and the Debugger floating head is no longer in the “active/open” state.
- [ ] CTO and Ross floating panels still open and close as they do today (no regression).
- [ ] Add or extend a focused test where practical (e.g. component or integration test asserting close emits / updates open state), or document in the PR why manual verification was used if the dialog stack is hard to unit-test.

## Notes for AI

- Likely touch points: `src/ui-app/src/components/FloatingHeads.vue` (`activeHead`, `@close` on `DebuggerChat`), `src/ui-app/src/components/DebuggerChat.vue` (close emit on X), and `src/ui-app/src/components/FloatingHeadPanel.vue` (Radix-style `Dialog` / overlay `@update:open`). Compare working close paths in `CTOPanel.vue` and `RepoGuideChat.vue`.
- Follow existing floating-head patterns: overlays must be teleported correctly (`AGENTS.md`); do not introduce unstyled `<select>` or bespoke dialog chrome.
- **Assumption:** This bug is specific to the global bottom-right Debugger floating head, not the per-task Debugger tab inside the task drawer (`TaskDebuggerChat.vue` / `DebugPanel.vue`). Fix the floating head first; only extend scope if the same root cause clearly affects the drawer variant.
- After UI changes, run `bun run fmt` and rebuild UI (`bun run build:ui` or `bun run build`). Run `repoos check --changed main` before handoff.
- Do not run `repoos serve` for routine verification; manual check in the browser or existing tests is sufficient unless the human requests a preview.

## Scope

**In scope:** Dismiss behavior for the Debugger floating-head chat panel and any shared dialog/wiring bug that prevents `close` from clearing `activeHead === 'debugger'`.

**Out of scope:** Debugger conversation content, API routes under `/api/debugger`, enabling/disabling the agent on the Agents page, and unrelated task-drawer debugger UX unless proven to share the same defect.

## Related

- Floating-head stack: `src/ui-app/src/components/FloatingHeads.vue`
- Chat UI standards: `docs/ai-chat-standards.md` (if scroll/jump behavior is touched, keep #0444 conventions)

## Original prompt

The debugger agent (floating head in bottom right) has a bug. When you open it you can't close it. Clicking on the background and the x button both fail to close it.

## Activity

- 2026-09-28T07:20:34Z · created · hello@repoos.org
- 2026-09-28T07:22:23Z · status draft→inbox, title, area, type, body
- 2026-09-28T07:58:39Z · status inbox→ready
- 2026-09-28T08:10:00Z · status ready→active, branch
