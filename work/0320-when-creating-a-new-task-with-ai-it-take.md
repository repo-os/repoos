---
updated_at: "2026-08-29T05:20:00Z"
review_passes: 1
id: "0320"
title: Highlight AI-created task cards until acknowledged
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/highlight-ai-created-task-cards-until-ac
created_at: "2026-08-29T04:31:08Z"
---
## Problem

When a task is created with AI, generation takes a few minutes. The user often looks away or switches context, and once the card finally appears there is no persistent visual cue that it has just been created — so the completed creation is easily missed. Freshly created cards look identical to every other card in the list.

## Desired UX

After an AI creation flow finishes, the resulting card enters an obviously "newly created" highlighted state that persists until the user clicks to acknowledge it. The interaction should mirror the existing acknowledge affordance for done cards (click to dismiss the highlight), but use a different color than the green/primary already used for done-card acknowledgement, so the two states can't be confused.

## Acceptance criteria

- [ ] A card produced by an AI creation flow displays a persistent "newly created" highlight once creation completes
- [ ] The highlight color is visually distinct from the green/primary used for the done-card acknowledgement state
- [ ] Clicking the card (or an explicit acknowledge affordance on it) clears the highlight
- [ ] The highlight survives page reloads until acknowledged
- [ ] Cards created without AI assistance are unaffected

## Notes for AI

- Assumption: acknowledgement state is persisted per task (e.g. an API-supported flag, or client-side storage keyed by task id) so the highlight returns after reload; pick whichever fits the existing done-card acknowledgement mechanism.
- Reuse the done-card acknowledgement pattern rather than inventing a parallel interaction model.
- UI lives in `src/ui-app` (Vite + Vue 3 SFCs); after any change, rebuild (`bun run build:ui` at minimum).
- Do not change the task-file frontmatter schema or parser for this — that would be self-modifying and is out of scope.
- Choose the alternate color to fit the existing design system (e.g. an amber/blue family); avoid green/primary per the user's note that it is overused.
- Do NOT write to `work/*.md` files directly; all task state changes go through `repoos` commands or the HTTP API.

## Scope

Covers only the highlight + acknowledgement of AI-created cards in the web UI. Deferred: notifications (sound/email/desktop), highlighting tasks that are merely updated, and any change to how AI task creation itself works.

## Original prompt

When creating a new task with AI it takes a few minutes and the user can easily miss that it's done being created, so let's change the card so that it's obviously been newly created until the user clicks to acknowledge that it's been created (similar to the acknowledgement of done cards -- but different color, since we re-use green/primary too much)

## Activity

- 2026-08-29T04:31:08Z · created · hello@repoos.org
- 2026-08-29T04:31:50Z · status draft→inbox, title, area, body
- 2026-08-29T04:33:24Z · status inbox→ready
- 2026-08-29T04:33:52Z · status ready→active, branch
- 2026-08-29T05:16:38Z · status active→review

