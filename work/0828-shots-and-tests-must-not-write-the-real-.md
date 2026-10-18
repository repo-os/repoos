---
id: "0828"
title: Shots and tests must not write the real repoos.toml (isolate config in preview captures)
type: bug
status: active
priority: p2
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/shots-and-tests-must-not-write-the-real-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T05:51:23Z"
updated_at: "2026-10-18T06:14:30Z"
---
## Problem
Selecting a setting in a preview or a shot capture (Settings autosaves "changes save automatically") writes the preview root's real `repoos.toml`, which for a task preview is the task worktree. That dirties the worktree and can leak into the branch (see #0822's repoos.toml conflict). Separately, the `settings:birdQuickTrail` shot fixture does not take effect: `/settings?tab=general&section=activity-animation&shotState=settings:birdQuickTrail` still shows Puppy tracks, so the E2 shot could not be captured without clicking the dropdown, and clicking would trigger the real save.

## Desired UX
In preview-build captures, config saves are held in memory or written to a temp config, never to the worktree's repoos.toml. Config shot fixtures (`settings:*`, `editor:*`) apply reliably after Settings mounts and navigation (find why Settings' form resets or ignores `applyShotPreviewConfigFixture`).

## Acceptance criteria
- Test: in a preview build, changing a setting does not modify repoos.toml on disk.
- Test: `settings:birdQuickTrail` leaves the Activity animation selector and preview on Bird quick trail after load and after a `section=` navigation.
- A handoff shot of the Settings preview shows bird footprints.

## Notes for AI
Start from App.vue applyShotFixturesFromLocation and src/ui-app/src/lib/shot-preview-fixtures.ts. Land after #0822, which is editing the same fixture files; if it has not landed, wait. Source: driver investigation 2026-10-18.

## Activity

- 2026-10-18T05:51:23Z · created · njachowski@gmail.com
- 2026-10-18T05:53:21Z · status inbox→ready
- 2026-10-18T06:14:27Z · cli_override, model_override
- 2026-10-18T06:14:30Z · status ready→active, branch
