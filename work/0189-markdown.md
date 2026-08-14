---
id: "0189"
title: Build Architect agent for architecture reviews and recommendations
type: feature
status: active
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/build-architect-agent-for-architecture-r
created_at: "2026-08-14T07:13:09Z"
updated_at: "2026-08-14T07:25:35Z"
---
```markdown
---
title: Build Architect agent for architecture reviews and recommendations
type: feature
priority: p2
area: core
assigned_to: ai
---

## Problem

We lack automated architecture review capability. There's no systematic way to assess the current system architecture, identify risks, spot improvements, or understand how pending tasks and decisions affect the overall design. The tech debt agent handles debt tracking, but we need a dedicated agent focused on architectural analysis and strategic recommendations.

## Desired UX

An Architect agent that operates similar to the tech debt agent, capable of running on demand or on a schedule. The agent analyzes the current codebase architecture, reviews tasks affecting architectural decisions, and produces a comprehensive markdown report with:
- Current architecture assessment
- Identified improvements and risks
- Recommendations for next steps

Reports are saved to `docs/agents/Architect/` with timestamped filenames for easy tracking and historical comparison.

## Acceptance criteria

- [ ] Architect agent can be invoked on demand
- [ ] Agent analyzes current system architecture and design decisions
- [ ] Agent reviews existing tasks in work/ for architectural impact
- [ ] Agent generates comprehensive report covering improvements, risks, and next steps
- [ ] Report is saved to `docs/agents/Architect/` with filename format `Architect_report_YYYY-MM-DD-HHMM.md`
- [ ] Agent can be scheduled for periodic runs
- [ ] Reports include actionable recommendations and rationale

## Notes for AI

- Model this agent after the tech debt agent for consistency in design and execution patterns
- The agent generates markdown reports only; it does not create or file tasks
- Ensure reports are well-structured, specific, and suitable for both technical and product stakeholders
- Filename format must use 24-hour time: `Architect_report_YYYY-MM-DD-HHMM.md` (e.g., `Architect_report_2026-08-14-1510.md`)
- Review task files in work/ for architectural implications and active architectural decisions
- Consider current git branch state, recent commits, and project structure in analysis
- Create the `docs/agents/Architect/` directory if it does not exist

## Scope

This task covers designing and building the Architect agent and its reporting system. It does not cover implementing architectural refactoring based on recommendations—follow-up tasks will be created by the team based on the agent's reports.
```

## Activity

- 2026-08-14T07:13:09Z · created · unknown
- 2026-08-14T07:13:57Z · title, branch
- 2026-08-14T07:16:18Z · status inbox→ready
- 2026-08-14T07:25:35Z · status ready→active
