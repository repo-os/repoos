---
id: "0125"
title: "Redesign Mission Control: drop Assigned-to-AI, add Needs-your-attention, vertical releases"
type: feature
status: draft
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: ""
model_override: default
pm_model_override: default
created_at: "2026-08-12T06:39:43Z"
updated_at: "2026-08-16T09:45:47Z"
---
## Context

Mission Control (DashboardView.vue) shows an "Assigned to AI" panel. Today
nearly every task is AI-assigned (only a handful are unassigned, none human),
so the panel is just "the list of everything" and provides zero signal. Replace
it with a panel that surfaces the tasks that actually need a human, and while
redesigning the page, turn Feature releases into a proper vertical timeline.

## Scope (all UI-only, no core/backend changes)

### 1. Remove the "Assigned to AI" panel
- Drop AiTasksPanel.vue from DashboardView.vue's dash-grid entirely; delete the
  component file if nothing else uses it.

### 2. Add a "Needs your attention" panel in its place
New component (e.g. NeedsYouPanel.vue) in the same grid slot, listing tasks a
human must act on, newest first, each with a reason tag so the user knows WHAT
to do:
- Human-assigned tasks: `assignee === "human"` (assigned_to set to any non-ai
  value), excluding done.
- Tasks flagged for the human regardless of assignee: `needs_input: true`
  ("needs input"), `needs_merge: true` ("merge needed"), and
  `status === "review"` ("awaiting sign-off").
- Dedupe: a task counts once even if it matches several reasons.
- Keep the existing row treatment (status dot + #id/title + status/area/branch)
  and click-to-open-task.
- Empty state: friendly message + a "New task for me" button that opens the new
  task drawer preset to assigned-to-human.

### 3. Feature releases → vertical list
- Rewrite ReleaseTimeline.vue's `.release-list` from the 2-column grid to a
  single-column vertical timeline: left rail with dot + connecting line,
  title/area/date, newest first, click opens the task.
- Keep it bounded (raise the cap from 8 to ~10–12 is fine); keep the empty state.

### 4. Other control-page upgrades (do the ones that fit cleanly)
- Rebalance the dash-grid so "Live activity" and "Needs your attention" sit
  side by side (1.3fr / 1fr as today).
- Sort the "Needs your attention" rows by priority (p1 first), then recency.
- Verify the page reads top-down sensibly: resources → stats → auto-eng →
  releases → activity/needs-you, and renders correctly in both themes and at
  mobile widths (grids already collapse at ≤1000px).

## Acceptance criteria
1. No "Assigned to AI" panel remains on Mission Control.
2. The replacement panel shows exactly the tasks needing a human, each with a
   reason tag, and an empty state with a human-task creation CTA.
3. Feature releases render as one vertical timeline (no 2-col grid), correctly
   date-sorted and bounded.
4. `repoos check` passes (build, typecheck, tests, headless UI smoke) with zero
   console errors.

## Files
- src/ui-app/src/views/DashboardView.vue
- src/ui-app/src/components/AiTasksPanel.vue (remove)
- src/ui-app/src/components/NeedsYouPanel.vue (new)
- src/ui-app/src/components/ReleaseTimeline.vue (vertical list)
- src/ui-app/src/stores/repo.ts (add a human-needs computed next to aiTasks)
- src/ui-app/src/style.css (grid/theme tweaks as needed)

## Related
- #0160 (draft) adds human tasks to the Work board with an AI/human filter
  toggle. Keep this task scoped to the control page; if #0160 lands first,
  reuse its assignee semantics instead of duplicating them.

## Activity

- 2026-08-16T09:45:47Z · title, body
