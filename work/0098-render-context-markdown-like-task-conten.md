---
id: "0098"
title: Render context markdown like task content
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/render-context-markdown-like-task-conten
created_at: "2026-08-11T16:05:31Z"
updated_at: "2026-08-11T18:46:35Z"
---
## Problem

Markdown files on the context page are not rendered with the same polished presentation used for markdown in the tasks panel. This creates an inconsistent reading experience between the two parts of the UI.

## Desired UX

When a user views a markdown file on the context page, its content is rendered with the same markdown presentation and styling used in the tasks panel.

## Acceptance criteria

- [ ] Markdown files on the context page render as formatted markdown rather than unstyled source content.
- [ ] The rendered output visually matches the markdown presentation used in the tasks panel.
- [ ] Common markdown elements supported in the tasks panel display consistently on the context page.
- [ ] Non-markdown context-page behavior remains unchanged.

## Notes for AI

- Reuse the tasks panel's existing markdown renderer and styling where practical.
- Avoid creating a separate markdown presentation system for the context page.
- Assume “similar” means consistent rendering and visual treatment, without requiring unrelated task-panel controls or task-specific metadata.
- Limit changes to the context-page markdown presentation and shared rendering code needed to support it.

## Scope

This task covers the rendering and presentation of markdown files on the context page. Changes to markdown syntax support or unrelated context-page functionality are deferred.

## Activity

- 2026-08-11T16:05:31Z · created · unknown
- 2026-08-11T18:46:07Z · status inbox→ready
- 2026-08-11T18:46:10Z · status ready→active
- 2026-08-11T18:46:31Z · status active→ready
- 2026-08-11T18:46:35Z · status ready→active, branch
