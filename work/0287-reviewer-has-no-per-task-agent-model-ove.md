---
id: "0287"
title: "Reviewer has no per-task agent/model override, unlike Dev and PM"
type: feature
status: active
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/reviewer-has-no-per-task-agent-model-ove
created_at: "2026-08-24T21:20:34Z"
updated_at: "2026-08-24T21:21:20Z"
---
## Problem
Dev and PM both support per-task agent/CLI/model overrides, chosen from a selector in their respective TaskDrawer tabs. The Review tab has no equivalent — the reviewer is a single global agent/model chosen once on the Agents settings page and used for every task's review, with no way to override it per-task.

## Current state (confirmed)
- `Task` (src/core/types.ts:106-116) has `agentOverride`/`cliOverride`/`modelOverride` (engineer) and `pmAgentOverride`/`pmCliOverride`/`pmModelOverride` (PM). There is no `reviewAgentOverride`/`reviewCliOverride`/`reviewModelOverride`.
- `resolveAgentForTask(config, task, role)` (src/server/agents.ts:1170) is the shared resolver that honors per-task overrides, already used for both `"engineer"` and (per the PM tab's wiring) `"pm"` roles.
- `resolveReviewer(config)` (src/server/agents.ts:1160) takes only `config`, no `task` — it always resolves the single globally-enabled `reviewer`-role agent from `repoos.toml`, with no override path at all:
  ```ts
  export function resolveReviewer(config: RepoOSConfig): Agent | null {
    const list = agentsForConfig(config);
    return list.find((a) => a.enabled && matchesRole(a, "reviewer")) ?? null;
  }
  ```
- Every call site that starts or continues a review (`src/server/review.ts:493, 532, 736, 965` — `canRun`, `run`, and the follow-up/auto-bounce paths) calls `resolveReviewer(this.config)` directly, never anything task-aware.
- TaskDrawer.vue has a fully built override UI for Dev (`agent-override-bar` around line 2484, `overrideDraft`/`isCustom`/`overrideDirty`, autosave via `agentOverrideAutoSaveTimer`) and an equivalent for PM (around line 2997, `pmOverrideDraft`/`pmIsCustom`/`pmOverrideDirty`). The Review tab has neither the UI nor the underlying data model to support it.

## Fix
1. **Data model:** add `reviewAgentOverride` / `reviewCliOverride` / `reviewModelOverride` to `Task` (src/core/types.ts), mirroring the PM fields exactly (same nullability, same PATCH-able shape).
2. **Server resolution:** give `resolveReviewer` a task-aware path — either extend `resolveAgentForTask` to accept `"reviewer"` as a role and have review.ts call that instead of `resolveReviewer(config)` directly, or add a `resolveReviewerForTask(config, task)` that layers task overrides on top of `resolveReviewer`'s base resolution (matching however PM's analogous wiring works). Update all four call sites in review.ts.
3. **API:** extend the task PATCH route/schema to accept the three new override fields, matching how `pmAgentOverride` etc. are already patchable.
4. **UI:** add an `agent-override-bar` to the Review tab in TaskDrawer.vue, copying the PM tab's pattern (draft state, dirty/custom detection, autosave-on-change, reset-to-default action) rather than the Dev tab's if there's any difference between the two — confirm which one PM actually mirrors before copying.
5. **Persistence via the standard write path:** overrides must go through the same `patchTaskFile`/API write path as Dev and PM overrides — no direct file writes.

## Acceptance criteria
- A task's Review tab shows an agent/model override selector functionally equivalent to the PM tab's (same interaction: pick agent, optionally override CLI/model, autosave, reset-to-default).
- Setting a review override and triggering "Review again" actually runs the overridden agent/model, not the global default — verify via the review session's recorded agent/model metadata (same place `cli`/`model` are logged in `.repoos/logs/tasks/<id>.log`'s "review started" entries).
- Auto-bounce and any other automated review trigger also honor the override (not just the manual "Review again" button) — check all four call sites in review.ts, not just the primary one.
- Leaving the override unset behaves exactly as today (global Agents-page reviewer, no behavior change for tasks that never set an override).
- `repoos check` green.

## Out of scope
- Changing what the Agents-page global reviewer toggle does, or removing it — it should remain the default when no per-task override is set, same relationship Dev/PM overrides have to their own global defaults.

## Activity

- 2026-08-24T21:20:34Z · created · unknown
- 2026-08-24T21:21:17Z · status inbox→ready
- 2026-08-24T21:21:20Z · status ready→active, branch
