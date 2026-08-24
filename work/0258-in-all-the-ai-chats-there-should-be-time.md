---
id: "0258"
title: Add timestamps to all AI chat panels
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-timestamps-to-all-ai-chat-panels
model_override: default
created_at: "2026-08-19T18:02:58Z"
updated_at: "2026-08-24T23:41:14Z"
---
## Problem

The AI chat panels — Debugger (DebuggerChat), Ross (RepoGuideChat), CTO (CTOPanel), and the PM tab in the TaskDrawer — do not show timestamps on individual messages. A human reading a conversation cannot tell when a message was sent, making it hard to gauge recency, correlate with other activity, or understand pacing. The Agent tab (dev chat) already shows step timestamps, but the other chats lack any per-message time reference.

## Desired UX

Every message bubble (both human and assistant) in the Debugger, Ross, CTO, and PM chat panels displays a small, subtle timestamp below or beside the message text. The timestamp shows the local time the message was created (e.g. "3:42 PM"). Human messages show when the user sent them; assistant messages show when the AI's response was received. Status/sys lines may omit timestamps since they are informational, not conversational.

## Acceptance criteria

- [ ] `AgentOutputEntry` gains an optional `at?: string` (ISO timestamp) field in both `src/core/types.ts` and `src/ui-app/src/types.ts`
- [ ] The server populates `at` on every `AgentOutputEntry` it creates (human, text, tool, step, sys) using the current ISO time at creation
- [ ] `DebuggerChat.vue` renders a small timestamp on each visible message row (human and assistant bubbles)
- [ ] `RepoGuideChat.vue` renders a small timestamp on each visible message row (human and assistant bubbles)
- [ ] `CTOPanel.vue` renders a small timestamp on each visible message row (human and assistant bubbles)
- [ ] The PM tab in `TaskDrawer.vue` renders a small timestamp on each visible PM message row (human and assistant bubbles)
- [ ] The Agent tab (dev chat) continues to work — its existing `stepAt` timestamps are unaffected
- [ ] Timestamps are styled consistently across all four chat panels (font size, color, position) using existing design tokens
- [ ] Timestamps on status/sys lines are hidden or rendered at lower prominence
- [ ] `repoos check` passes

## Notes for AI

- **Data model change is the right approach.** The SSE `agent.output` event already carries an `at` field, but the `AgentOutputEntry` itself does not. Adding `at` to the entry type means both persisted transcripts and live-streamed entries carry their own timestamp — no client-side guesswork needed.
- Files to touch:
  - `src/core/types.ts` — add `at?: string` to the `AgentOutputEntry` union (on every variant, or as an intersected optional on the union)
  - `src/ui-app/src/types.ts` — mirror the same `at?: string` addition
  - `src/server/agents.ts` — in `recordEntry()` (~line 2605) and wherever entries are constructed (e.g. `human` entries at ~line 2311, ~line 2354), stamp `at: new Date().toISOString()`
  - `src/server/cto.ts` — stamp `at` on entries created by the CTO agent
  - `src/server/review.ts` — stamp `at` on entries created by the review agent
  - `src/ui-app/src/components/DebuggerChat.vue` — render `entry.at` as a timestamp in each row
  - `src/ui-app/src/components/RepoGuideChat.vue` — same
  - `src/ui-app/src/components/CTOPanel.vue` — same
  - `src/ui-app/src/components/TaskDrawer.vue` — same for the PM tab rows
- Reuse `toLocaleTimeString()` (or a shared `fmtTime(iso)` helper) for consistent formatting. The project already uses this pattern in `AutoEngineeringPanel.vue` and `TaskCard.vue`.
- Preserve backward compatibility: `at` is optional, so old persisted transcripts without it simply don't show a timestamp — no migration needed.
- Legacy `{ s, d }` entries (pre-JSON sessions) will not have `at`. The UI should gracefully hide the timestamp when absent.

## Scope

- In scope: adding `at` to `AgentOutputEntry`, server-side stamping, and rendering timestamps in Debugger, Ross, CTO, and PM chats.
- Out of scope: timestamp formatting preferences (12h vs 24h), relative timestamps ("2 min ago"), changing the Agent tab's existing timestamp display, adding timestamps to the feed/activity panels.

## Related

- 0114: add-persistent-repo-aware-agent-chat
- 0082: chat-with-agents
- 0090: persist-agent-session-transcripts-to-disk

## Original prompt

In all the AI chats there should be timestamps on each message (e.g. PM, ross, cto, debugger etc) the dev chat alraedy has timestamps, so that one is ok. the timestamps are needed so a human can tell when the chat message was sent (also show the time when a human chat was sent)

## Activity

- 2026-08-19T18:02:58Z · created · hello@repoos.org
- 2026-08-20T11:20:02Z · status draft→inbox
- 2026-08-23T08:13:33Z · model_override
- 2026-08-24T20:29:43Z · status inbox→ready
- 2026-08-24T20:56:41Z · status ready→active, branch
- 2026-08-24T23:41:14Z · watchdog: auto-surfaced stuck task · status active→ready · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
