---
id: "0911"
title: "Easter eggs bundle: dropzone shot evidence (Manual tab, default picker)"
type: feature
status: inbox
priority: p3
area: web
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-22T01:34:32Z"
updated_at: "2026-10-22T01:34:32Z"
---
## Items
- [ ] **E1 · Manual-tab handoff capture does not show a dropzone** (web) — #0899's declared Manual-tab shot has a click step but no recorded assertion, so the capture alone does not prove the dropzone rendered. Source: reviewer notes on #0899 (passes 4 and 5), 2026-10-22.
- [ ] **E2 · TaskDrawer handoff shot shows the upload-failure state, not the default picker** (web) — the declared TaskDrawer fixture lands on the failure state; add a shot of the default upload picker beside it. Source: same reviewer notes.

## Problem
#0899 landed the dropzone layout fix, but two pieces of handoff evidence are weaker than they should be: one declared shot has no assertion, and the TaskDrawer shot shows only the failure state.

## Desired UX
Reviewers can see the dropzone rendered on the Manual tab and the default (non-error) picker in the TaskDrawer without extra steps.

## Acceptance criteria
- E1: the Manual-tab shot declares an assert that the dropzone exists, and the capture shows it in light and dark themes.
- E2: a TaskDrawer shot of the default picker is declared next to the failure-state shot, using a state fixture, no placeholder-selector click steps.
- Both pass a handoff capture with zero console errors.

## Notes for AI
See #0899 and its reviews under .repoos/reviews/0899/. Use repoos update --shots to declare shots. Easter-eggs bundle (one open bundle at a time); keep it to these two items.

## Activity

- 2026-10-22T01:34:32Z · created · njachowski@gmail.com
