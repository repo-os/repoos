---
id: "0337"
title: Add debugger agent chat to task debug tab
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-debugger-agent-chat-to-task-debug-ta
model_override: opencode-go/hy3
created_at: "2026-09-08T13:25:03Z"
updated_at: "2026-09-08T14:44:16Z"
---
## Problem
When an agent run fails (for example an engineer agent hitting an auth error on Claude Code at startup), there is no in-product place that aggregates the full task context — PM/developer/reviewer chats, logs, and status — and turns it into actionable guidance. The user is left to read raw logs and guess the fix and next step. The task side panel already has a Debug tab showing the task's logs, but there is no agent there that can reason over the whole task and tell the user what went wrong and what to do.

## Desired UX
- The task panel's **existing Debug tab** gains a chat with a dedicated **debugger agent**, alongside the logs that are already shown there. The tab must let the user **both see the logs and chat with the debug agent** — the chat does not replace the current logs view.
- The debugger agent has read access to the complete task context: the task file/metadata, all conversation threads (PM, developer/engineer, reviewer), and the task's logs/output.
- The debugger agent can explain failures in plain language (e.g. "the engineer agent got an auth error from Claude Code because X") and recommend or apply fixes.
- From the same chat, the user (or the agent) can easily dispatch follow-up instructions to the engineer or to the PM to act on the diagnosis — e.g. send a fix instruction to the engineer agent, or ask the PM to update the task.
- In the auth-error example, the debug agent should tell the user the likely cause, the exact remediation steps, and what to do next (re-run the engineer, fix credentials, escalate to PM, etc.).

## Acceptance criteria
- [ ] The existing Debug tab on the task panel contains a debugger-agent chat interface.
- [ ] The Debug tab still shows the current task logs — the chat is additive and must not replace or remove the existing logs view (user can see logs and chat in the same tab).
- [ ] The debugger agent's context includes: task metadata/body, all agent chat threads (PM, developer/engineer, reviewer), and task logs.
- [ ] The debugger agent can produce a diagnosis and recommended fix for a task failure.
- [ ] The user can send instructions from the debug chat to the engineer agent and to the PM (a clear, low-friction action).
- [ ] A representative failure scenario (e.g. engineer agent auth error) is handled end-to-end: the debug agent explains the cause, suggests the fix, and offers a path to act.
- [ ] No raw secrets/credentials are surfaced in the debug chat output.

## Notes for AI
- Follow existing UI conventions: routes in `src/ui-app/src/router.ts`, views in `src/ui-app/src/views/*View.vue`, nav in `src/ui-app/src/nav.ts`, dialog CSS in `src/ui-app/src/style.css`.
- Reuse the existing chat UI patterns in the UI app rather than building a separate chat from scratch.
- **The Debug tab already exists in the task side panel and currently shows task logs.** Extend that tab — do not replace, hide, or degrade the existing logs display. A combined layout (logs + chat side by side, or a toggle within the tab) is fine as long as both are reachable in the tab.
- The debugger agent is a UI surface over existing agent conversations and logs — it should not duplicate the PM/engineer/reviewer agents, but read their existing data. Assume the relevant chat transcripts and logs are already persisted and retrievable per task; wire the debug agent to that data source.
- Zero runtime dependencies is a hard constraint — do not add a runtime dependency without a separate authorizing task.
- This is a UI/feature task; agent backend wiring is in scope only as far as feeding context into the debug chat. If cross-agent dispatch (sending instructions to engineer/PM) requires new server endpoints, define them minimally.

## Scope
Covers: the debugger chat UI added within the existing Debug tab (alongside the current logs view), context aggregation (chats + logs + metadata), diagnosis display, and dispatch actions to engineer/PM.
Deferred: building new autonomous agent orchestration, persistence changes beyond what's needed to feed the debug agent, and broader multi-agent redesign.

## Related
- `docs/native-auth.md` (auth/login context relevant to the example failure)
- `AGENTS.md` (task lifecycle, agent roles: PM, engineer, reviewer)

## Original prompt

I want to add a debugger agent chat in the debug tab of tasks panel, this debugger agent should be able to see all the info and chats (pm, dev, reviewer) and logs of the task and be able to recommend and fix things (or send off instruction to engineer or pm easily to fix it). e.g. I just hit an auth error on claude code when an engineer agent started working, the debug agent on that task should tell the user how to fix it and what to do next.

## Activity

- 2026-09-08T13:25:03Z · created · hello@repoos.org
- 2026-09-08T13:25:20Z · status draft→inbox, title, area, body
- 2026-09-08T14:26:24Z · body
- 2026-09-08T14:27:25Z · model_override
- 2026-09-08T14:28:19Z · status inbox→ready
- 2026-09-08T14:28:41Z · status ready→active, branch
- 2026-09-08T14:44:16Z · status active→review
