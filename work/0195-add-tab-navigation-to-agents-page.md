---
review_rounds: 1
id: "0195"
title: Add tab navigation to agents page
type: feature
status: review
needs_merge: true
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/add-tab-navigation-to-agents-page
model_override: default
created_at: "2026-08-14T12:23:17Z"
updated_at: "2026-08-15T05:42:39Z"
---
## Problem

The agents page is becoming too long and difficult to navigate. Organizing agent types into logical sections via tab navigation will improve user experience and make it easier for users to find the agents they're looking for.

## Desired UX

The agents page displays a tabbed interface with four sections:
- **Default Agents** — built-in agents
- **Custom Agents** — user-created agents
- **Build Your Team** — onboarding or agent creation flow
- **Detected Coding Agents** — agents discovered from the codebase

Users can click tabs to switch between sections, with clear visual indication of the active tab. Content loads within the tab container, keeping navigation persistent at the top.

## Acceptance Criteria

- [ ] Tab navigation component is added to the agents page
- [ ] Four tabs are present and labeled: Default Agents, Custom Agents, Build Your Team, Detected Coding Agents
- [ ] Clicking a tab displays the corresponding content
- [ ] Active tab is visually distinguished (highlight, underline, or similar)
- [ ] Tabs remain functional and responsive on mobile viewports
- [ ] All existing agent functionality is preserved and working

## Notes for AI

- Assume Default Agents tab is the initial active tab on page load
- Existing agent content should be distributed across the appropriate tabs without duplicating logic
- No agents should be lost or hidden in this refactor—all agents remain accessible, just organized
- Check for any routing or deep-linking requirements if users should be able to link to specific tabs

## Activity

- 2026-08-14T12:23:17Z · created · unknown
- 2026-08-14T12:24:26Z · status inbox→ready
- 2026-08-15T02:23:47Z · status ready→active, branch
- 2026-08-15T02:42:47Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-15T03:34:32Z · status review→done, release:success
- 2026-08-15T03:53:39Z · status done→ready
- 2026-08-15T03:53:41Z · status ready→active
- 2026-08-15T05:42:21Z · model_override
- 2026-08-15T05:42:39Z · status active→review
- 2026-08-15T05:42:39Z · needs_merge

