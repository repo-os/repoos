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
updated_at: "2026-08-13T06:26:30Z"
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
- 2026-08-13T06:26:30Z · completed · hierarchical file tree with expand/collapse, file leaf nodes, refresh button, and session-scoped state persistence
