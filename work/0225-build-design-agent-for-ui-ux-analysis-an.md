---
id: "0225"
title: Build Design agent for UI/UX analysis and recommendations
type: feature
status: done
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/build-design-agent-for-ui-ux-analysis-an
created_at: "2026-08-16T10:35:56Z"
updated_at: "2026-08-16T11:21:33Z"
---
## Problem

RepoOS has no systematic way to review the quality of its own web UI. There is no automated check that catches UI bugs, surfaces UX friction, or proposes design improvements. The Architect agent reviews codebase architecture and the tech debt agent tracks code issues, but neither looks at the user-facing experience — layout, styling, component consistency, accessibility, and interaction flows. The web UI (Vite + Vue 3 SFC under `src/ui-app/`) evolves task by task with no design steward to keep it coherent or to flag visual regressions as they land.

## Desired UX

A "Design Agent" card in the **Build your team** section of the Agents page, modeled after the Architect agent. It is a UI/UX design expert that runs on demand (Run now) or on a schedule (daily/weekly) to analyze the current UI/UX of the web UI and produce a markdown report covering:

- **UI bugs** — visual glitches, broken layouts, styling inconsistencies, rendering issues
- **UX friction** — awkward flows, confusing interactions, dead ends, unclear states
- **Proposed updates, fixes, and new designs** — grounded in best practices and practicality, with concrete references to the files/components involved

Reports are saved to `docs/agents/Design/` with timestamped filenames, same pattern as the Architect, for tracking and historical comparison. The agent enables/disables like the other built-in agents, persists its schedule and last-run time, and never leaves a broken build behind.

## Acceptance criteria

- [ ] Design Agent card appears in "Build your team" (`src/ui-app/src/views/AgentsView.vue`), following the `<BuiltInAgentCard>` pattern, with a name, description, and icon
- [ ] Card metadata is registered in `src/ui-app/src/components/BuiltInAgentCard.vue` for the new `design` agent
- [ ] Agent can be invoked on demand and scheduled for periodic runs (daily/weekly/manual), consistent with the Architect card
- [ ] Agent analyzes the current web UI under `src/ui-app/` — components, views, styling, layout, and interaction flows
- [ ] Report covers UI bugs found, UX frictions identified, and proposed updates/fixes/new designs with rationale grounded in best practices and practicality
- [ ] Report is saved to `docs/agents/Design/` with filename format `Design_report_YYYY-MM-DD-HHMM.md`
- [ ] Enable/disable state, schedule, and last-run time persist across reloads and restarts (via `builtInAgents` config)
- [ ] Agent runs through the existing built-in agent dispatch path (`runBuiltInAgent` in `src/server/built-in-agents.ts`)
- [ ] `repoos check` passes (build, typecheck, tests, headless UI smoke check)
- [ ] No new runtime dependency

## Notes for AI

- Model this agent after the Architect agent (`runArchitectAgent` in `src/server/built-in-agents.ts`) for consistency: scan → generate markdown report → save to `docs/agents/<Agent>/` → record `lastRunAt` in `builtInAgents` config.
- Register the agent in the dispatch switch in `runBuiltInAgent` (`src/server/built-in-agents.ts`) and wire the report/scan types following the existing `ArchitectRunResult`/`ArchitectureScanResult` pattern.
- Add the card in `AgentsView.vue` inside the "Build your team" `<Card>` alongside tech-debt/performance/architect, and add the `design` entry to `agentMeta` in `BuiltInAgentCard.vue` (name, description, icon).
- Filename format must use 24-hour time: `Design_report_YYYY-MM-DD-HHMM.md` (e.g., `Design_report_2026-08-16-1430.md`). Create the `docs/agents/Design/` directory if it does not exist.
- The agent analyzes the web UI: `src/ui-app/src/components/`, `src/ui-app/src/views/`, stylesheet/Tailwind usage, layout and responsive behavior, accessibility (labels, contrast, keyboard focus), and consistency with existing component patterns.
- Recommendations should be specific and actionable — reference concrete files/components and explain why (best practice) and whether it is practical to do.
- Report only — like the Architect, the agent generates markdown reports and does not itself edit UI source or create tasks. Assumption: "fix any UX frictions" means the report proposes concrete fixes; implementing them happens in follow-up tasks created from the report.

## Scope

This task covers designing and building the Design Agent and its reporting system (scan, report generation, on-demand + scheduled runs, card UI). It does not cover implementing the proposed UI fixes or redesigns — follow-up tasks will be created from the agent's reports. It does not include a floating-head/chat panel for the Design Agent.

## Related

- #0189 — Architect agent (reporting pattern, `docs/agents/` storage, schedule/run model to mirror)
- #0201 — Debugger agent (Build your team card + `BuiltInAgentCard`/`AgentsView.vue` wiring)

## Activity

- 2026-08-16T10:35:56Z · created · unknown
- 2026-08-16T10:36:20Z · status inbox→ready
- 2026-08-16T10:36:52Z · status ready→active, branch
- 2026-08-16T10:48:11Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-16T11:21:33Z · status review→done, release:success
