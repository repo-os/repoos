---
updated_at: "2026-08-27T09:49:48Z"
review_passes: 1
id: "0312"
title: Fix tab switching after changing agent+model in a task's pm/dev/review tabs
type: bug
status: review
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-tab-switching-after-changing-agent-m
model_override: deepinfra/zai-org/GLM-5.3-Flash
created_at: "2026-08-27T09:34:41Z"
---
## Problem

In a task's pm/dev/review tab, selecting an agent+model to change the model
causes the active tab to switch away right after the selection is made. This
happens often, possibly always. The likely cause is that saving the new
agent+model triggers some state update or re-render that resets the active
tab, so the selected tab no longer stays focused.

This is a regression in UX — a user changing a model shouldn't lose their
place and be bounced to a different tab.

## Desired UX

When a user selects an agent+model in the pm/dev/review tab of a task, the
change should be saved and the user should remain on the same tab they were
already viewing. No automatic tab change should occur as a side effect of the
save.

## Acceptance criteria

- [ ] Selecting an agent+model in a task's pm/dev/review tab does not change
      the currently active tab.
- [ ] The user remains on the same tab after the model/agent save completes.
- [ ] Tab switching only happens when the user explicitly clicks a different
      tab.
- [ ] The agent+model selection still saves correctly (no regression in the
      save behavior itself).

## Notes for AI

- Investigate the save flow in the task pm/dev/review tab (likely under
  `src/ui-app`). Look for any state update, store mutation, or re-render that
  resets the active tab after the agent+model save.
- The root cause is hypothesized to be the save triggering an unrelated update
  that re-renders and resets the active tab. Confirm this before fixing.
- Preserve the existing save behavior; only eliminate the unintended tab
  change.
- Rebuild the UI after changes (`bun run build:ui` for speed, or
  `bun run build`) and run `repoos check` to confirm nothing breaks.

## Scope

- Covers fixing the unintended tab switch in the task's pm/dev/review tab
  when changing agent+model.
- Deferred: any unrelated tab-switching behavior elsewhere in the app.

## Related

- docs/native-auth.md (if the underlying issue involves auth/backdoor flows,
  only as applicable)

## Original prompt

Bug: when I change the model in a tasks pm/dev/review tab it often (maybe always)  changes tab right after I select an agent+model. Can you figure out why and fix it? I think it may be saving the new agent+model and something gets updated or re-rendered so that's why it changes tab...

## Activity

- 2026-08-27T09:36:32Z · status draft→inbox, title, area, type, body
- 2026-08-27T09:36:59Z · status inbox→ready
- 2026-08-27T09:38:38Z · model_override
- 2026-08-27T09:38:41Z · status ready→active, branch
- 2026-08-27T09:48:34Z · status active→review

