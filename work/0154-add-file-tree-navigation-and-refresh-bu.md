---
id: "0154"
title: Add file tree navigation and refresh button to context page
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/add-file-tree-navigation-and-refresh-but
created_at: "2026-08-13T05:43:16Z"
updated_at: "2026-08-13T10:18:50Z"
---
## Problem

The context page currently lists many docs in a flat layout, making it difficult to navigate as the documentation grows. There's no way to organize or collapse/expand documentation directories.

## Desired UX

A hierarchical file tree view where documentation directories can be expanded and collapsed. A refresh button should force reload the latest docs from disk.

## Acceptance criteria

- [x] Replace flat doc list with a collapsible file tree view
- [x] Directories show expand/collapse controls
- [x] Files appear as leaf nodes in the tree
- [x] Add a refresh button that re-scans and reloads docs
- [x] Tree state (expanded/collapsed) persists during the session

## Notes for AI

- Target files: likely in `src/ui-app` where the context/docs view is implemented
- Use a tree component pattern (Vue 3 SFC); consider reusing or adapting existing component structure
- Refresh should call the same doc-scan logic used on initial load
- Preserve existing doc metadata (title, path) in the tree structure
- Assume Vue 3 reactive state for tree expansion state management
- No new dependencies; use native browser features + existing codebase patterns

## Activity

- 2026-08-13T05:43:16Z · created · unknown
- 2026-08-13T05:52:00Z · corrected · title/frontmatter/body cleaned up — the kiro agent's raw terminal output (ANSI color codes + box-drawing rendering of the `---` frontmatter delimiters) was stored verbatim instead of being parsed
- 2026-08-13T06:16:10Z · status inbox→ready
- 2026-08-13T06:16:22Z · status ready→active, branch
- 2026-08-13T09:46:05Z · watchdog: automatic resume attempted
- 2026-08-13T09:52:05Z · watchdog: escalated to needs_input · handoff signal was not detected after the automatic resume · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-13T10:18:50Z · status active→review, needs_input
- 2026-08-13T10:41:00Z · updated · address review findings: tree now renders to arbitrary depth (flat recursion via lib/docTree), expansion state keyed by full path (no same-name collisions), refresh failures surfaced with a visible error, stale selection reset on refresh
