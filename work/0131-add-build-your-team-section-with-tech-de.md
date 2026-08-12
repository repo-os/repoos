---
id: "0131"
title: Add Build Your Team section with Tech Debt Agent
type: feature
status: active
priority: p2
area: web
assigned_to: unassigned
created_by: ""
branch: feat/add-build-your-team-section-with-tech-de
created_at: "2026-08-12T10:01:45Z"
updated_at: "2026-08-12T18:35:28Z"
---
## Problem

Agents are becoming a core way users extend RepoOS. Currently, users can only create custom agents from scratch. There's no discovery or easy adoption path for pre-built agents that solve common problems. Tech debt is a persistent challenge that users want help identifying and tracking, but it requires manual effort to spot and document.

## Desired UX

A new "Build Your Team" section appears on the agents page below "Custom Agents," showcasing pre-built optional agents users can enable. The Tech Debt Agent is the first such agent, with:

- A card/component showing what the agent does
- Configuration for run frequency (once daily, once weekly, on-demand)
- A manual "Run Now" button to trigger immediately
- Once run, the agent scans the repo and surfaces tech debt issues as tasks added to the Inbox list
- Shows the agent's status and when it last ran

## Acceptance Criteria

- [ ] "Build Your Team" section added to agents page, positioned below Custom Agents section
- [ ] Tech Debt Agent card displays in the section with description and run controls
- [ ] Schedule selector allows user to choose: Daily, Weekly, or Manual only
- [ ] "Run Now" button triggers immediate execution of Tech Debt Agent
- [ ] Tech Debt Agent scans repo and identifies tech debt patterns (outdated dependencies, code duplication, performance concerns, etc.)
- [ ] Identified issues are created as tasks in the Inbox list
- [ ] Agent displays status (idle, running, completed) and last-run timestamp
- [ ] Agent configuration (schedule choice) persists across sessions

## Notes for AI

- Structure the "Build Your Team" section to be extensible; this is the first agent but more may follow
- Tech Debt Agent should analyze: package/dependency versions, repeated code patterns, files with high complexity, unused code, and deprecated APIs
- Task creation should include enough context (file paths, line numbers, specific issue) so users can act on the suggestions
- Assume integration with existing task creation system (inbox list)
- Store agent schedule/configuration in user settings or project config
- No advanced filtering or customization of the Tech Debt Agent itself at this stage; keep the MVP simple
- Consider rate-limiting or performance: scanning a large repo should not block the UI

## Scope

**Included**: UI section layout, Tech Debt Agent core logic, scheduling UI, manual trigger, task creation integration

**Deferred**: Additional pre-built agents, advanced Tech Debt Agent configuration, viewing past scan results, agent marketplace or ratings

## Activity

- 2026-08-12T10:01:45Z · created · unknown
- 2026-08-12T10:02:06Z · status inbox→ready
- 2026-08-12T18:23:13Z · status ready→active, branch
