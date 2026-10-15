---
id: "0788"
title: Align model playground dropdowns and agent/model selector
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/align-model-playground-dropdowns-and-age
model_override: opencode/muse-spark-1.3-contributor-free
created_at: "2026-10-15T05:33:42Z"
updated_at: "2026-10-15T05:56:51Z"
review_rounds: 1
review_passes: 1
---
## Problem

The model playground dropdowns do not match the styling used elsewhere in the product, and the playground does not work with the normal coding agent-and-model modal selector.

## Desired UX

The model playground’s dropdowns match the styling used elsewhere, and users can use the normal coding agent-and-model modal selector with the playground.

## Acceptance criteria

- [ ] Model playground dropdowns use the styling used elsewhere in the product.
- [ ] The model playground works with the normal coding agent-and-model modal selector.

## Notes for AI

- Prefer reusing the existing dropdown styling and coding agent-and-model selector rather than introducing separate versions.

## Scope

Covers the model playground’s dropdown styling and its compatibility with the normal coding agent-and-model modal selector.

## Original prompt

Fix the dropdowns on the model playground to match the style we use everywhere else. Also I'd like the model playground to also work with the normal coding agent+model modal selector.

## Shots
```json
[
{
"label": "Model playground filters using shared dropdown style",
"target": "default",
"route": "/agents?tab=playground",
"highlight": ".playground-filter-row"
}
]
```

## Screenshots

![Screenshot-2026-10-15-at-12.31.15](/api/tasks/0788/attachments/screenshot-1.png)
![Screenshot-2026-10-15-at-12.30.00](/api/tasks/0788/attachments/screenshot-2.png)

## Activity

- 2026-10-15T05:33:42Z · created · hello@repoos.org
- 2026-10-15T05:33:44Z · screenshots
- 2026-10-15T05:33:44Z · screenshots
- 2026-10-15T05:34:02Z · status draft→inbox, title, area, body
- 2026-10-15T05:35:45Z · model_override
- 2026-10-15T05:35:46Z · status inbox→ready
- 2026-10-15T05:35:48Z · status ready→active, branch
- 2026-10-15T05:37:03Z · model_override
- 2026-10-15T05:41:38Z · body
- 2026-10-15T05:42:47Z · body
- 2026-10-15T05:43:33Z · body: section Shots
- 2026-10-15T05:49:48Z · status active→review
- 2026-10-15T05:50:42Z · note: review pass 1: needs some work
- 2026-10-15T05:50:42Z · status review→active
- 2026-10-15T05:56:51Z · body
