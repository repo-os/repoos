---
id: "0513"
title: Add a shared full-size screenshot viewer modal used everywhere screenshots appear
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-a-shared-full-size-screenshot-viewer
model_override: cursor-grok-4.6-medium
created_at: "2026-09-26T05:25:23Z"
updated_at: "2026-09-26T09:32:28Z"
review_passes: 1
dev_error_count: 1
---
## Problem

Screenshots are now easy to upload (New task panel, PM chat, New input, bug
report), but every one of those places renders them as small fixed-size
thumbnails with no way to inspect the detail. When a screenshot proves a bug or
shows a UI state, the only recourse today is to already have the file locally —
and in most surfaces there is no recourse at all (the Input detail view is the
sole exception, and it punts to a raw browser tab via an `open in new tab` link).

The same thumbnail markup is also hand-rolled in five separate places
(`TaskDrawer.vue` new-task grid, `TaskDrawer.vue` PM-chat strip,
`NewInputPanel.vue`, `InputsView.vue` input detail, `SettingsView.vue` bug
report), so "make screenshots bigger" would otherwise be five near-duplicate
implementations that drift apart.

## Desired UX

- Every screenshot thumbnail in the app carries a small **expand / see larger**
  affordance next to it.
- Activating it opens **one modal, centered on screen**, containing **all** the
  screenshots of that group, stacked in their original order, each at its
  natural size, in a vertically scrollable area. No downscaling small images
  back up; no cropping.
- Dismissal is always available three ways: the **[x]** button in the modal's
  corner, a **click on the dimmed background**, and `Escape`.
- One component, one look, one behavior, reused at every screenshot site — the
  modal does not care whether the image is a pending `data:` URL or a
  server-served `/api/.../attachments/...` URL.

## Acceptance criteria

- [ ] A single shared screenshot-viewer component exists (one component, not
      per-site copies) and is used by every screenshot surface listed below.
- [ ] It renders all passed screenshots in order, in a scrollable, centered
      modal, each at natural size, with its file name shown as a caption.
- [ ] It closes on `[x]`, on a click of the dimmed background outside the
      content, and on `Escape`.
- [ ] The close `[x]` and the modal's own chrome are visually distinct from the
      per-thumbnail **Remove screenshot** `x`, which keeps its current
      behavior — removing a screenshot must never open the viewer.
- [ ] Each thumbnail exposes the expand affordance as a real `<button>` with an
      accessible name and tooltip, and the viewer is also reachable by keyboard
      (tab to the button, `Enter`/`Space` to open).
- [ ] New-task panel screenshot grid (`TaskDrawer.vue`, `ui.pendingScreenshots`)
      uses it.
- [ ] PM chat compose screenshot strip (`TaskDrawer.vue`, `ui.pmScreenshots`)
      uses it.
- [ ] New input panel attachment strip (`NewInputPanel.vue`,
      `ui.inputScreenshots`) uses it.
- [ ] Input detail attachments (`InputsView.vue`, `activeInput.attachments`)
      uses it; the existing "open in new tab" link for the raw file is kept and
      still opens the file itself.
- [ ] Bug report screenshot grid (`SettingsView.vue`,
      `bugReportScreenshots`) uses it.
- [ ] Non-image attachments (e.g. a PDF in the input detail list) keep their
      existing link and get no expand button.
- [ ] Agent/avatar images (`CTOPanel`, `FloatingHeads`, `DebuggerChat`,
      `TaskDebuggerChat`, `RepoGuideChat`, `/assets/*.webp`) are unchanged.
- [ ] Viewer styles live in the shared stylesheet, not a component's
      `<style scoped>` block, and the overlay is body-teleported (the modal must
      not be trapped inside a drawer's stacking context).
- [ ] A UI test covers the shared component and at least one call site;
      `repoos check` passes.

## Notes for AI

- Build on what already exists — do **not** add a lightbox/zoom dependency
  (zero runtime dependencies is a hard constraint). The shared
  `src/ui-app/src/components/ui/dialog/*` primitives wrap Radix Dialog, which
  already teleports to `body` via its portal, already closes on overlay click
  and `Escape`, and already handles focus trapping/restore. Reuse them rather
  than hand-rolling a `position: fixed` overlay (an unteleported fullscreen
  overlay inside the task drawer is unscrollable and unclickable — see
  `AGENTS.md`).
- Likely shape: a `ScreenshotViewer`-style component under
  `src/ui-app/src/components/` (or `components/ui/`) taking a list of
  `{ src, name }` plus a `v-model:open` and an optional start index, rendering
  the dialog itself. Call sites then only hold the boolean. Because the content
  is teleported to `body`, its CSS belongs in `src/ui-app/src/style.css` — see
  the dialog/form-class conventions in `AGENTS.md`.
- Reuse an expand icon that is visually distinct from the existing `X` remove
  button (e.g. `Maximize2`/`Expand` from the icon set already in use in
  `TaskDrawer.vue`).
- Assumption — clicking the thumbnail itself also opens the viewer; the remove
  button and any link inside the thumbnail must `stopPropagation` so they keep
  their own meaning. Stated here because the user asked only for a button.
- Assumption — pending screenshots are `data:` URLs and stored ones are
  `/api/...` URLs; the component takes a plain `src` so both work unchanged, and
  no fetch/download plumbing is needed.
- Assumption — one modal per group: the "all screenshots" shown are the ones in
  the group that was clicked (a group's pending set, or one input's
  attachments), not a global gallery across the app.
- This is a view-only change: do not touch the upload, storage,
  `POST /api/tasks/:id/attachments`, `pm-attachments.ts`, or the `## Screenshots`
  task-body section logic.
- Run `bun run fmt` before committing on the branch (the pre-commit hook skips
  task branches, and the close-out gate is the first place formatting is
  enforced). Tests go in `src/ui-app/tests/`, run with `bun run test`.

## Scope

**In:** one shared full-size, scrollable screenshot viewer modal, plus the expand
affordance wired into the five existing screenshot surfaces (New task panel, PM
chat compose, New input panel, Input detail, bug report composer).

**Deferred:** zoom/pan, rotation, download, a thumbnail filmstrip inside the
modal, cross-group/global galleries, non-image (PDF) previews, rendering
screenshots that currently only exist as `![…]()` markdown inside a task body,
and any mobile-specific gallery treatment.

## Related

- #0123 (task screenshot attachments), #0381 / #0382 (PM chat screenshot
  upload), #0498 / #0510 (retain screenshot drafts) — the upload surfaces this
  task puts a viewer in front of.
- `AGENTS.md` — dialog/`Teleport` rules, zero-runtime-dependency constraint,
  shared `style.css` conventions, and the `repoos check` gate.

## Original prompt

The new screenshots upload is better, but when we have screenshots uploaded anywhere they are often too small to see details, so let's add an "expand" or "see larger" button next to screenshots which opens them all in a scrollable modal in the center of the screen which can be dismissed by clicking the background opacity or an [x] button on the modal. Re-use this functionality everywhere that we have screenshots in the app so that the user has a consistent uiux and the codebase is clean.

## Screenshots

![Screenshot-2026-09-26-at-13.22.16](/api/tasks/0513/attachments/screenshot-1.png)

## Activity

- 2026-09-26T05:25:23Z · created · hello@repoos.org
- 2026-09-26T05:25:25Z · screenshots
- 2026-09-26T05:26:29Z · status draft→inbox, title, area, body
- 2026-09-26T07:58:53Z · status inbox→ready
- 2026-09-26T08:17:14Z · model_override
- 2026-09-26T08:17:16Z · status ready→active, branch
- 2026-09-26T08:30:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-26T08:31:49Z · status active→review
- 2026-09-26T08:31:49Z · agent exited with an error (cursor) · Skill routing: frontend-design, diagnose-repoos-close-out-validation-failures, frontend-testing
- 2026-09-26T09:32:28Z · status review→done, release:success
