---
id: "0411"
title: Let the user pick any preview target from a ranked dropdown
type: feature
status: done
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: feat/let-the-user-pick-any-preview-target-fro
review_model_override: opencode-go/hy3
created_at: "2026-09-18T12:51:51Z"
updated_at: "2026-09-18T15:15:13Z"
---
## Problem

A task's `area` decides which `[[preview.targets]]` it can preview, and it's often wrong. #0409 was about the landing page and the VitePress docs site but was tagged `area: web`, so the preview could only serve the default RepoOS UI. The #0379 target `<select>` only appears when *several targets match the area*, and `resolvePreviewTarget` (`src/server/preview.ts`) rejects any target name outside that area match, so a user can't recover from a wrong area.

## Desired UX

- When the repo defines more than one previewable target, the task drawer's preview row shows a dropdown of **all** targets, ranked with area matches first (then the default), and pre-selected to the top-ranked one.
- One preview at a time, on one line: pick a target → **Start preview**; to see another, **Stop preview**, pick the next, start again.
- With a single target (or only the default command), no dropdown: behavior unchanged.
- The running-preview bar keeps showing which target is served (label after the URL).

## Acceptance criteria

- [ ] `resolvePreviewTarget` accepts any configured target by name, not only area matches; ranking puts area matches first.
- [ ] Dropdown shown whenever more than one target exists, for active and review tasks.
- [ ] Only one preview runs per task; starting another requires stopping the current one.
- [ ] Tests cover ranking, an out-of-area pick, and the single-target no-dropdown case.

## Activity

- 2026-09-18T12:51:51Z · created · unknown
- 2026-09-18T14:03:40Z · status inbox→ready
- 2026-09-18T14:17:27Z · review_model_override
- 2026-09-18T14:17:30Z · status ready→active, branch
- 2026-09-18T14:22:58Z · status active→review
- 2026-09-18T15:15:13Z · status review→done, release:success
