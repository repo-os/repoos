---
id: "0972"
title: "Easter eggs bundle: no model-refresh error for uninstalled agents"
type: bug
status: inbox
priority: p3
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-28T08:00:32Z"
updated_at: "2026-10-28T08:00:32Z"
---
## Items

- E1 · Agents page: no model-refresh error for an agent that is not installed (reported by Nick, 2026-10-28)

## E1 · No model-refresh error for an uninstalled agent

### Problem
After Nick uninstalled Kiro on purpose, the Agents page shows "kiro: Couldn't refresh models (kiro-cli not found on PATH) — showing your saved list." with a Retry button. An agent that was installed and was then removed is not an error.

### Desired UX
An agent whose CLI is not on PATH shows no failed/stale model notice and no Retry. At most it shows a muted "Not installed" state, the same as any other undetected agent. Real probe failures for an installed CLI (timeouts, a bad exit) still show the notice.

### Acceptance criteria
- The models probe in `src/core/models.ts` reports "not on PATH" as a distinct not-installed result, not a generic error.
- `modelNoticeFor` in `src/ui-app/src/stores/config.ts` returns `null` (or a non-error state) for a not-installed CLI, including when a saved list exists.
- Test: a stale saved list plus a not-installed probe gives no "Couldn't refresh models" notice; an installed CLI whose probe fails still gives the notice.

### Notes for AI
The string comes from `modelNoticeFor` (`stores/config.ts`, around line 325). The "<cli> not found on PATH" errors are produced in `src/core/models.ts` (e.g. kiro at about line 456). Also check why an uninstalled CLI is probed at all: `agentsMeta.clis` may list every supported CLI instead of the detected ones.

## Activity

- 2026-10-28T08:00:32Z · created · njachowski@gmail.com
