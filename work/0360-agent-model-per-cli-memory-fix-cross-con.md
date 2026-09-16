---
id: "0360"
title: "Agent/model-per-CLI memory: fix cross-context crosstalk and surface unrecoverable resets"
type: feature
status: review
priority: p3
area: ui
assigned_to: ai
created_by: ""
branch: feat/agent-model-per-cli-memory-fix-cross-con
created_at: "2026-09-15T19:00:08Z"
updated_at: "2026-09-16T06:56:15Z"
---
## Problem

Follow-up from #0342's review (good to go, not blocking, but flagged two real gaps in the per-CLI model memory it added to `AgentModelControl`/`AgentModelModal.vue`):

1. **Cross-context crosstalk.** Memory is keyed by CLI only, and shared by every `AgentModelControl` consumer: AgentsView, `BuiltInAgentCard`, TaskDrawer per-task overrides, NewSkillPanel/NewDocPanel. Context A's model pick for a given CLI overwrites context B's remembered pin for that same CLI. So switching CLI-and-back in context B can silently restore context A's model and auto-save it — even though per-task overrides are supposed to be per-task by nature. Never worse than the pre-#0342 always-reset-to-"default" behavior, but the blast radius is wider than the "Agents page" framing suggested.

2. **Unremembered pins are still wiped instantly.** On the first-ever CLI switch for a given CLI, in another browser, or with cleared localStorage, the model still resets to `"default"` and auto-saves to `repoos.toml` immediately — no confirmation, no indication anything changed. #0342's original minimum ask ("don't auto-save instantly, or surface the wipe") remains unaddressed for this case.

## Desired UX

- Key the per-CLI model memory per (agent or task) + CLI, not CLI alone, so contexts stop bleeding into each other.
- When a CLI switch resets to "default" because nothing could be restored, surface it (e.g. a toast or inline note: "model reset to default — was X") rather than silently auto-saving. Note the recoverability #0342 added is browser-local — invisible to tunnel/remote users on another machine — so this surfacing matters most for that unremembered-pin case.

## Notes for AI

- Source: `.repoos/reviews/0342.md` suggestions section, and the task body of #0342 itself for the original ask.
- Relevant code: `src/ui-app/src/components/AgentModelModal.vue`'s `selectCli()`/`remember()`/`resolveModelForCli()`/`isKnownModelForCli()`.
- `repoos check` must pass with no regressions.

## Activity

- 2026-09-15T19:00:08Z · created · unknown
- 2026-09-16T06:52:00Z · status inbox→ready
- 2026-09-16T06:52:01Z · status ready→active, branch
- 2026-09-16T06:56:15Z · status active→review
