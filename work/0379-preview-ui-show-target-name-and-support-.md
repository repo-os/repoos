---
id: "0379"
title: "Preview UI: show target name and support multi-area matches"
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/preview-ui-show-target-name-and-support-
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-16T17:18:21Z"
updated_at: "2026-09-17T07:12:20Z"
---
## Problem

`repoos.toml` supports multiple named `[[preview.targets]]`, each scoped to
a list of `areas` (see `PreviewTargetConfig` in src/core/types.ts:620).
`resolvePreviewTarget` (src/server/preview.ts:154) picks one target to serve
a task's preview, but the UI gives no indication of *which* target/frontend
is being previewed — just a generic busy/disabled state. This will only get
more confusing as projects define more than one previewable frontend
(landing, docs, app, etc.).

Split out of #0374, which is scoped narrowly to loading-feedback UI and
explicitly does not touch preview resolution logic. This task is about
target *identity* and *multiplicity*, not loading feedback — treat them as
separate concerns even though both touch the preview quickbar.

## Desired outcome

1. **Show the target name.** When a preview is starting/running, surface its
   `name` (e.g. "docs", "landing", "app") in the UI so it's clear which
   frontend is being served, not just "a preview is running."

2. **Handle a diff that touches multiple areas.** Today `resolvePreviewTarget`
   returns a single match. If a task's changed files span multiple targets'
   `areas`, decide and implement one of:
   - a selector/picker in the UI listing all matched target names, letting
     the user choose which one to preview, or
   - some way to switch between matched targets without restarting from
     scratch.
   Given the existing "one preview running at a time" constraint (see
   AGENTS.md preview section), switching between multiple simultaneously
   live previews is likely out of scope — a switcher that stops one and
   starts another is probably the right shape, but confirm against current
   `preview.ts` behavior before assuming.

   At minimum: never silently pick one target when multiple match — the user
   must be able to see/select which one they're getting.

## Constraints

- Coordinate with #0374 if both are in flight — they touch the same
  quickbar UI; avoid conflicting layout changes.
- Don't break the existing single-target, single-area-match case, which
  should keep working exactly as it does today (just now also showing the
  target's name).

## Acceptance criteria

- [ ] Preview quickbar shows the active/starting preview's target name.
- [ ] A task whose diff matches multiple `[[preview.targets]]` areas lets the
      user see and choose among the matched targets, rather than silently
      previewing an arbitrary one.
- [ ] A task matching exactly one target (today's common case) is unaffected
      behaviorally, only gains the name label.
- [ ] `repoos check` passes.

## Related

- #0374 — preview start loading-feedback (split from this task; narrower,
  UI-only, does not touch resolution logic).
- #0370 — introduced per-target `readyTimeoutMs` and the `[[preview.targets]]`
  area-matching this task builds on.
- #0362 — original task preview feature.

## Activity

- 2026-09-16T17:18:21Z · created · unknown
- 2026-09-17T06:07:24Z · status inbox→ready
- 2026-09-17T06:54:02Z · model_override
- 2026-09-17T06:54:03Z · status ready→active, branch
- 2026-09-17T07:12:20Z · status active→review
