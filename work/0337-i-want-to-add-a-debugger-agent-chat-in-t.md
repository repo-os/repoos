---
id: "0337"
title: Add debugger agent chat to task debug tab
type: feature
status: inbox
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-08T13:25:03Z"
updated_at: "2026-09-08T13:25:20Z"
---
## Problem
When an agent run fails (for example an engineer agent hitting an auth error on Claude Code at startup), there is no in-product place that aggregates the full task context — PM/developer/reviewer chats, logs, and status — and turns it into actionable guidance. The user is left to read raw logs and guess the fix and next step. A debug tab exists conceptually but has no agent that can reason over the whole task and tell the user what went wrong and what to do.

## Desired UX
- The task panel's Debug tab shows a chat with a dedicated **debugger agent**.
- The debugger agent has read access to the complete task context: the task file/metadata, all conversation threads (PM, developer/engineer, reviewer), and the task's logs/output.
- The debugger agent can explain failures in plain language (e.g. "the engineer agent got an auth error from Claude Code because X") and recommend or apply fixes.
- From the same chat, the user (or the agent) can easily dispatch follow-up instructions to the engineer or to the PM to act on the diagnosis — e.g. send a fix instruction to the engineer agent, or ask the PM to update the task.
- In the auth-error example, the debug agent should tell the user the likely cause, the exact remediation steps, and what to do next (re-run the engineer, fix credentials, escalate to PM, etc.).

## Acceptance criteria
- [ ] Debug tab exists (or is populated) on the task panel and contains a debugger-agent chat interface.
- [ ] The debugger agent's context includes: task metadata/body, all agent chat threads (PM, developer/engineer, reviewer), and task logs.
- [ ] The debugger agent can produce a diagnosis and recommended fix for a task failure.
- [ ] The user can send instructions from the debug chat to the engineer agent and to the PM (a clear, low-friction action).
- [ ] A representative failure scenario (e.g. engineer agent auth error) is handled end-to-end: the debug agent explains the cause, suggests the fix, and offers a path to act.
- [ ] No raw secrets/credentials are surfaced in the debug chat output.

## Notes for AI
- Follow existing UI conventions: routes in `src/ui-app/src/router.ts`, views in `src/ui-app/src/views/*View.vue`, nav in `src/ui-app/src/nav.ts`, dialog CSS in `src/ui-app/src/style.css`.
- Reuse the existing chat UI patterns in the UI app rather than building a separate chat from scratch.
- The debugger agent is a UI surface over existing agent conversations and logs — it should not duplicate the PM/engineer/reviewer agents, but read their existing data. Assume the relevant chat transcripts and logs are already persisted and retrievable per task; wire the debug agent to that data source.
- Zero runtime dependencies is a hard constraint — do not add a runtime dependency without a separate authorizing task.
- This is a UI/feature task; agent backend wiring is in scope only as far as feeding context into the debug chat. If cross-agent dispatch (sending instructions to engineer/PM) requires new server endpoints, define them minimally.
- Assumption: "Debug tab" refers to an existing or planned tab within the per-task panel; if no Debug tab exists yet, this task includes creating it.

## Scope
Covers: the debug-tab debugger chat UI, context aggregation (chats + logs + metadata), diagnosis display, and dispatch actions to engineer/PM.
Deferred: building new autonomous agent orchestration, persistence changes beyond what's needed to feed the debug agent, and broader multi-agent redesign.

## Related
- `docs/native-auth.md` (auth/login context relevant to the example failure)
- `AGENTS.md` (task lifecycle, agent roles: PM, engineer, reviewer)

## Original prompt

I want to add a debugger agent chat in the debug tab of tasks panel, this debugger agent should be able to see all the info and chats (pm, dev, reviewer) and logs of the task and be able to recommend and fix things (or send off instruction to engineer or pm easily to fix it). e.g. I just hit an auth error on claude code when an engineer agent started working, the debug agent on that task should tell the user how to fix it and what to do next.

## Activity

- 2026-09-08T13:25:03Z · created · hello@repoos.org
- 2026-09-08T13:25:20Z · status draft→inbox, title, area, body
