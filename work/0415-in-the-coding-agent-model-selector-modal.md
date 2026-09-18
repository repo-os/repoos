---
id: "0415"
title: Rank favorited models by most recently used in model selector
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
review_model_override: opencode-go/hy3
created_at: "2026-09-18T14:19:22Z"
updated_at: "2026-09-18T14:38:45Z"
---
## Problem

The model selector modal displays favorited models, but when a user has many favorites (as seen in the coding agent modal), the models are not ordered in a way that prioritizes frequently-used choices. This requires users to scan through the full list to find recently-used models, adding friction to the workflow.

## Desired UX

In the model selector modal, favorited models should be ranked by most recently used, with the most recently accessed model appearing first. This surfaces the user's common choices and reduces navigation time.

## Acceptance criteria

- [ ] Favorited models in the model selector modal are sorted by most recently used
- [ ] The most recently used favorited model appears at the top of the list
- [ ] When a user selects a model, its "recently used" timestamp is updated
- [ ] The sorting applies consistently across sessions
- [ ] Non-favorited models are not affected by this change

## Notes for AI

- This task applies to the coding agent's model selector modal specifically
- You will need to locate the model selector modal code and understand how favorited models are currently rendered
- Determine how "most recently used" data is currently tracked (if at all) or implement tracking if needed
- Assume there is already a mechanism to track model selection/usage; if not, implement one as part of this task
- The ordering should be persistent and survive page reloads/sessions

## Scope

- In scope: Sorting favorited models by most recently used in the model selector modal
- Out of scope: Changes to which models are marked as favorites, UI redesign of the modal, behavior of non-favorited models

## Original prompt

In the coding agent + model selector modal I want to rank favorited models by most recently used. E.g. in this screenshot you can see for opencode I have a lot of favorited models, so it would be much better if they were ranked by most recently used.

## Screenshots

![Screenshot-2026-09-18-at-22.18.37](/api/tasks/0415/attachments/screenshot-1.png)

## Activity

- 2026-09-18T14:19:22Z · created · hello@repoos.org
- 2026-09-18T14:19:22Z · screenshots
- 2026-09-18T14:19:38Z · status draft→inbox, title, area, body
- 2026-09-18T14:38:45Z · review_model_override
