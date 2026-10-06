---
id: "0719"
title: "Task card 'stuck · silent Nm' counts from the turn start after a reload, not the agent's last output"
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Notes for AI"
priority: p2
area: web
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-06T14:01:47Z"
updated_at: "2026-10-06T15:56:54Z"
---
## Problem

TaskCard.vue (codingOrStuckHint) computes silence from repo.agentActivityAt[taskId] ?? repo.runningSince[taskId]. agentActivityAt is updated only by live SSE output events (stores/repo.ts ~1556, with the browser's own clock). After a page load, tab wake, or SSE reconnect, fetchRunning() (stores/repo.ts ~3066) seeds it from /api/agents/running startedAt, i.e. the START of the current turn. So an agent that produced output 3 minutes ago shows 'stuck · silent 9m' (seen on #0698 on 2026-10-06: last output 21:56:13, turn start 21:49:41, card said 9m at ~21:58). The server already tracks session.lastOutputAt (src/server/agents.ts ~6087) and uses it for the silent-run attention item.

## Desired UX

- /api/agents/running returns lastOutputAt per running task (the server's value), and fetchRunning seeds agentActivityAt from it, falling back to startedAt only when there has been no output yet.
- The silent time shown in the card and the Dev tab 'QUIET' banner agree with the server's silent-run detector (one source of truth; sleep-aware per #0678).
- The tooltip says when the last output was ('last output 21:56').

## Acceptance criteria

- Tests: fetchRunning with lastOutputAt newer than startedAt seeds agentActivityAt from it; card hint shows silence from lastOutputAt; falls back to startedAt when absent; /api/agents/running includes lastOutputAt.
- repoos check passes.

## Activity

- 2026-10-06T14:01:47Z · created · unknown
- 2026-10-06T14:01:49Z · needs_input
- 2026-10-06T14:56:36Z · note: Superseded by #0721 (lastOutputAt on /api/agents/running).
- 2026-10-06T15:56:54Z · note: Superseded by #0721 (lastOutputAt on /api/agents/running).
