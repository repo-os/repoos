---
updated_at: "2026-08-29T07:46:14Z"
review_passes: 2
id: "0319"
title: Improve model playground layout and filtering
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/improve-model-playground-layout-and-filt
created_at: "2026-08-29T04:18:28Z"
---
## Problem
The model playground tab is hard to navigate and use. There is no way to search for a specific model among a long list, no quick way to narrow by provider or by token cost, the whole tab scrolls instead of just the model list (so controls and context get pushed out of view), and the model list is too narrow to comfortably read model names and metadata.

## Desired UX
- A search bar lets the user filter the model list by name as they type.
- A provider dropdown lets the user show only models from a selected provider (plus an "All providers" default).
- A token-cost filter (e.g. a max-cost control or cost range) lets the user hide models above a chosen token price.
- Only the long model list scrolls; the rest of the tab (search bar, dropdown, filters, header) stays fixed in place.
- The model list occupies roughly half the tab width, giving model names and metadata room to breathe.

## Acceptance criteria
- [ ] A model search bar is present at the top of the playground tab and filters the visible model list by model name in real time.
- [ ] A provider dropdown is present and filters the model list to the selected provider, with an "All providers" option as the default.
- [ ] A token-cost filter is present and hides models whose token cost exceeds the chosen threshold.
- [ ] Scrolling is confined to the model list container; the surrounding tab chrome (search, dropdown, filters) does not scroll away.
- [ ] The model list width is approximately half of the tab width.
- [ ] The search, provider, and cost filters compose correctly (e.g. searching within a filtered provider still works).

## Notes for AI
- This is the web UI playground; look in `src/ui-app` (likely a ModelPlayground / Models component and its styles) for the relevant SFC and CSS.
- Scroll confinement is a layout/CSS fix: the model list should be in its own scrollable container (fixed-height with `overflow-y: auto`) while the tab itself does not scroll.
- Widen the list via the existing layout (flex/grid); target ~50% width rather than guessing arbitrary pixel values so it holds across tab sizes.
- Compose filters in the existing list-computation logic rather than adding separate, conflicting filter states.
- Do not change the set of available models or their data source; this is purely presentation/filtering.
- After UI changes, rebuild so the worktree build is fresh (per repo conventions).

## Scope
Covers the search bar, provider dropdown, token-cost filter, scroll containment, and list width within the model playground tab. Deferred: persisting filter state across sessions, sorting, multi-select provider filtering, and any backend/model-catalog changes.

## Related
- Playground / model list UI in `src/ui-app`

## Original prompt

model playground fixes/features - add model search bar, add dropdown for model provider, add filter by model token cost, fix scroll behavior so that only the long model list scrolls, not the whole tab. Also make the model list wider (half of the tab width).

## Activity

- 2026-08-29T04:18:28Z · created · hello@repoos.org
- 2026-08-29T04:18:55Z · status draft→inbox, title, area, body
- 2026-08-29T04:31:33Z · status inbox→ready
- 2026-08-29T04:31:43Z · status ready→active, branch
- 2026-08-29T05:01:35Z · status active→review


