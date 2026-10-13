---
id: "0764"
title: "Budget Controls tab: agent+model allowlist for agent drivers"
type: feature
status: review
priority: p2
area: [web, server, cli]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/budget-controls-tab-agent-model-allowlis
model_override: opencode/big-pickle
created_at: "2026-10-13T09:20:52Z"
updated_at: "2026-10-13T11:24:23Z"
---
## Problem
Agent drivers (AI sessions that operate RepoOS: overriding engineers, starting tasks, restarting stuck runs) have repeatedly picked coding agents and models that are too expensive. Nothing tells a driver which agent+model pairs are acceptable, and nothing stops it. A human driver should keep the full list; an agent driver should be steered to a human-approved subset.

## Desired UX
- A new **Budget Controls** tab on the Agents page (`?tab=budget-controls`, deep-linkable like the other tabs).
- It has one section, **Agent+Models Allowlists for Agent Drivers**.
- The section lists the allowed coding agents. Each agent has its own list of allowed models.
- Each agent's model list is **collapsed by default** and shows the count of allowed models while collapsed (for example "claude code · 2 models"). Expanding shows the models. The allowlist can get long, so collapsed is the default state.
- Add and edit entries with the existing coding agent+model selector modal, reused as-is or lightly extended. Do not build a second picker. Use the shared dialog components and the custom dropdown (see AGENTS.md Conventions).
- The allowlist is **optional**. When it is empty or unset, nothing is restricted and agent drivers behave as today. Say so in the section copy.

## Acceptance criteria
- Allowlist is stored in `repoos.toml` (agent -> allowed models), is editable from the Budget Controls tab, and has a `getConfigSchema()` entry plus a test (AGENTS.md: every user-facing setting needs a Settings UI control).
- Enforcement: when an agent driver (not a human via the UI) sets an engineer/reviewer override (`repoos override`, `PATCH` on `cliOverride`/`modelOverride`) to a pair not on the allowlist, the server refuses with a clear error that lists the allowed pairs. Humans in the UI are never restricted and still see the full list. Decide and document how the server tells an agent driver from a human (for example CLI/API caller identity vs UI session); fail toward allowing the human path.
- Discoverability: `repoos override --help`, `repoos agents` or a similar read command prints the allowlist so a driver can choose from it, and AGENTS.md (driver rules) and `user-docs/` mention it.
- Collapsed-by-default model lists with counts; empty-state copy; keyboard accessible; works in all themes (contrast audit stays green).
- Tests for the schema, the refusal, the human bypass, the empty-allowlist no-op, and the collapsed/count rendering.
- Declare `## Shots` for the new tab using a route (`/agents?tab=budget-controls`), not click steps.

## Notes for AI
- Start from `src/ui-app/src/views/AgentsView.vue` (tab list and `?tab=` handling), `src/ui-app/src/components/AgentModelControl.vue` and `ChatAgentModelChip.vue` (existing agent+model selector), and `cmdOverride` in `src/commands/control-api.ts:309` plus the matching server route.
- No new runtime dependencies. Keep area to `web, server, cli`.
- Out of scope: per-task spend caps, token budgets, or cost display. This task is only the allowlist and its enforcement.

## Activity

- 2026-10-13T09:20:52Z · created · njachowski@gmail.com
- 2026-10-13T09:22:09Z · model_override
- 2026-10-13T09:22:10Z · status inbox→ready
- 2026-10-13T09:22:12Z · status ready→active, branch
- 2026-10-13T11:24:23Z · status active→review
