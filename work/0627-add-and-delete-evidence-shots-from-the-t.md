---
id: "0627"
title: Add and delete evidence shots from the task drawer
type: feature
status: active
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: The reviewer sent this back to the engineer 2 times and still found issues. Human review needed.
priority: p2
area: [web, server]
assigned_to: ai
created_by: ""
branch: feat/add-and-delete-evidence-shots-from-the-t
created_at: "2026-10-02T11:41:24Z"
updated_at: "2026-10-03T00:36:32Z"
review_passes: 3
review_rounds: 2
---
## Problem
Evidence shots are only declared by the engineer (via `repoos update --shots`) and captured automatically at handoff. When a reviewer or the human sees a missing or wrong screenshot (#0625: a stale blind `/` capture blocked the corrected one), the only fixes are the CLI or deleting files under `work/.attachments/<id>/shots/` by hand. There is no UI to add a shot, and no way at all to remove a wrong one.

## Desired UX
In the task drawer's Changes / UI changes section:

- **Add shot** button opens a shared-dialog modal (`ui/dialog/*`, body-teleported, global `ff-*` form classes). Fields are plain inputs, never raw JSON: Target (styled dropdown of configured `[[preview.targets]]`), Route, Label, optional Highlight selector, optional Selector (element crop), and an optional Steps repeater (click / fill+text / waitFor / waitMs, plain CSS selectors) with add/remove/reorder rows. Inline validation uses the same rules as `--shots`.
- Submit appends the entry to the task's `## Shots` list **and captures just that shot immediately**, with a clear pending state (capture takes 5-30s), then the new image appears in the list. Errors are specific and kept in the modal: preview busy, Playwright/WebKit unavailable, route failed to load, selector/highlight matched nothing (a warning, shot still saved).
- **Delete** on each existing shot (confirm via the shared dialog, never native `confirm()`). It removes the image and its manifest entry, and, when a matching declaration exists in `## Shots`, removes that entry too so a later re-handoff doesn't resurrect it.
- Works while the task is `active` or `review`. It only edits the task `.md` (through the normal task-patch path) and gitignored `work/.attachments/`, never the worktree, so it respects the review lock rules in AGENTS.md.

## Acceptance criteria
- [ ] **API:** `POST /api/tasks/:id/shots` validates one entry with `parseShotPlan` rules (one shared validator with the CLI, no second copy), appends it to `## Shots` via `patchTaskFile` section write, captures only that entry, stores it tagged as declared (NOT `origin: "auto"`, so re-handoff cleanup never deletes it), and returns the stored shot or a structured error. `DELETE /api/tasks/:id/shots/:name` removes file + manifest entry (+ matching declaration).
- [ ] **Capture:** refactor the capture path in `src/server/shot-capture.ts` so a single entry can be captured without planning the whole list; reuse `captureShotPage`; honor the one-preview-at-a-time cap with a clear busy error rather than silently evicting a preview someone is viewing.
- [ ] **UI:** Add shot modal and per-shot delete in `TaskDrawer.vue` / `shot-rows.ts`; styled dropdown, shared dialogs, aligned form layout, keyboard accessible; no native `title` tooltips.
- [ ] **Task md:** `## Shots` stays a valid fenced JSON list after add and delete; other body sections and the Activity log untouched; an activity note records "shot added/removed".
- [ ] **Docs:** `user-docs/review-and-close-out.md` (or the shots doc) describes add/delete; note in `docs/` if the declaration/delete sync has non-obvious rules.
- [ ] **Tests:** route tests (add happy path, invalid entry rejected, busy preview, delete + declaration sync, auto-origin shots unaffected), a component test for the modal validation, and store tests for removal; `repoos check` passes.
- [ ] **Shots:** Declare `## Shots` showing the Changes section with the Add shot modal open and the delete control, via `repoos update <id> --shots`.

## Notes for AI
- Pieces already in place: `parseShotPlan` / `provenanceCaption` (`src/core/shot-plan.ts`), `--shots` validation and `shotsSectionContent` (`src/commands/tasks.ts`: lift the shared validation into core rather than duplicating it), `runAutoShotCapture` / `planAutoCapture` (`src/server/shot-capture.ts`), `localShotStore` with `origin: "auto"` and `removeAuto()` (`src/server/shots.ts`, added in cba0e264; add a single-shot `remove(name)`), `GET /api/tasks/:id/shots` in `src/server/routes/tasks.ts`.
- Provenance for a hand-added shot is `declared: <label>`. Delete must work for auto, declared, and legacy untagged shots (no `origin`).
- Steps repeater is the fiddly part; keep v1 to the four existing step kinds. Out of scope for v1: a live selector tester and a click-to-pick element picker.
- Never run `repoos serve` yourself; do not request a preview unless the human asks. Rebuild UI after changes (`bun run build:ui`).

## Shots
```json
[
  {
    "label": "UI changes section with Add shot and per-shot delete",
    "target": "default",
    "route": "/work?task=0627",
    "highlight": ".ui-changes",
    "steps": [
      {
        "click": "[data-test-id=task-tab-changes]"
      },
      {
        "waitMs": 400
      }
    ]
  },
  {
    "label": "Add-shot modal open over the UI changes section",
    "target": "default",
    "route": "/work?task=0627",
    "highlight": ".add-shot-modal",
    "steps": [
      {
        "click": "[data-test-id=task-tab-changes]"
      },
      {
        "waitMs": 400
      },
      {
        "click": "[data-test-id=add-shot]"
      },
      {
        "waitMs": 400
      }
    ]
  }
]
```

## Activity

- 2026-10-02T11:41:24Z · created · unknown
- 2026-10-02T18:20:44Z · status inbox→ready
- 2026-10-02T18:22:41Z · status ready→active, branch
- 2026-10-02T19:09:31Z · body: section Shots
- 2026-10-02T19:22:14Z · status active→review
- 2026-10-02T19:23:50Z · status review→active
- 2026-10-02T19:37:22Z · status active→review
- 2026-10-02T19:39:23Z · status review→active
- 2026-10-02T19:49:49Z · status active→review
- 2026-10-02T19:51:42Z · needs_input
- 2026-10-02T23:42:00Z · status review→active
- 2026-10-03T00:19:01Z · status active→review
- 2026-10-03T00:19:01Z · status review→active
- 2026-10-03T00:36:32Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
