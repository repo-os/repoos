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
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-05T15:01:24Z"
updated_at: "2026-10-07T18:14:41Z"
handoff_signal_retry_count: 2
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

## Shots
```json
[
  {
    "label": "CTO panel — simplified header, agent/model chip, shared compose input",
    "target": "default",
    "route": "/",
    "highlight": ".floating-head-panel .agent-chat-header",
    "steps": [
      {
        "click": "button.head-btn img[alt=\"CTO\"]"
      },
      {
        "waitMs": 500
      }
    ]
  },
  {
    "label": "Debugger panel — simplified header and agent/model chip",
    "target": "default",
    "route": "/",
    "highlight": ".floating-head-panel .agent-chat-header",
    "steps": [
      {
        "click": "button.head-btn img[alt=\"Debugger\"]"
      },
      {
        "waitMs": 500
      }
    ]
  },
  {
    "label": "Ross panel — simplified header and agent/model chip",
    "target": "default",
    "route": "/",
    "highlight": ".floating-head-panel .agent-chat-header",
    "steps": [
      {
        "click": "button.head-btn img[alt=\"Ross\"]"
      },
      {
        "waitMs": 500
      }
    ]
  }
]
```

## Activity

- 2026-10-05T15:01:24Z · created · unknown
- 2026-10-05T22:32:55Z · status inbox→ready
- 2026-10-07T17:06:44Z · status ready→active, branch
- 2026-10-07T17:17:27Z · body
- 2026-10-07T17:24:39Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-07T17:24:40Z · status review→active
- 2026-10-07T17:29:47Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/debugger-floating-close.test.ts:56:55
     54|
     55|     // A render-time ReferenceError leaves the slot unrendered, so the…
     56|     expect(wrapper.find(".debugger-header").exists()).toBe(true);
       |                                                       ^
     57|     expect(wrapper.find(".debugger-close").exists()).toBe(true);
     58|     expect(wrapper.text()).toContain("diagnosis ready");
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 439 passed | 1 skipped (441)
      Tests  1 failed | 5353 passed | 15 skipped (5369)
   Start at  17:25:23
   Duration  259.23s (transform 6.72s, setup 2.20s, import 45.68s, tests 244.08s, environment 203.82s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 776ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  17:29:43
   Duration  2.74s (transform 1.14s, setup 13ms, import 1.43s, tests 776ms, environment 445ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T17:35:17Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/debugger-floating-close.test.ts:56:55 · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-07T17:35:17Z · status review→active
- 2026-10-07T17:42:04Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/debugger-floating-close.test.ts:56:55
     54|
     55|     // A render-time ReferenceError leaves the slot unrendered, so the…
     56|     expect(wrapper.find(".debugger-header").exists()).toBe(true);
       |                                                       ^
     57|     expect(wrapper.find(".debugger-close").exists()).toBe(true);
     58|     expect(wrapper.text()).toContain("diagnosis ready");
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 439 passed | 1 skipped (441)
      Tests  1 failed | 5353 passed | 15 skipped (5369)
   Start at  17:37:29
   Duration  269.62s (transform 7.57s, setup 2.23s, import 49.63s, tests 247.84s, environment 215.32s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 714ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  17:41:59
   Duration  2.76s (transform 1.18s, setup 13ms, import 1.48s, tests 714ms, environment 472ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T17:47:17Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/debugger-floating-close.test.ts:56:55 · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-07T17:47:17Z · status review→active
- 2026-10-07T17:52:36Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —      63|       attachTo: document.body,
     64|       props: { open: true },
     65|       global: { plugins: [pinia, router] },
       |              ^
     66|     });
     67|     await flushPromises();
 ❯ processTicksAndRejections ../../unknown:7:39
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 439 passed | 1 skipped (441)
      Tests  1 failed | 5353 passed | 15 skipped (5369)
   Start at  17:48:00
   Duration  271.10s (transform 7.00s, setup 2.27s, import 48.46s, tests 251.01s, environment 216.08s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 713ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  17:52:31
   Duration  2.69s (transform 1.15s, setup 13ms, import 1.44s, tests 713ms, environment 446ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T17:58:17Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/debugger-floating-close.test.ts:56:55 · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-07T17:58:17Z · status review→active
- 2026-10-07T18:00:38Z · cli_override, model_override
- 2026-10-07T18:03:36Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/debugger-floating-close.test.ts:56:55
     54|
     55|     // A render-time ReferenceError leaves the slot unrendered, so the…
     56|     expect(wrapper.find(".debugger-header").exists()).toBe(true);
       |                                                       ^
     57|     expect(wrapper.find(".debugger-close").exists()).toBe(true);
     58|     expect(wrapper.text()).toContain("diagnosis ready");
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 439 passed | 1 skipped (441)
      Tests  1 failed | 5353 passed | 15 skipped (5369)
   Start at  17:59:01
   Duration  270.25s (transform 6.97s, setup 2.32s, import 49.17s, tests 248.11s, environment 216.62s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 706ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  18:03:32
   Duration  2.68s (transform 1.16s, setup 12ms, import 1.44s, tests 706ms, environment 442ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T18:09:46Z · body
- 2026-10-07T18:13:46Z · body
- 2026-10-07T18:14:41Z · body: section Shots
