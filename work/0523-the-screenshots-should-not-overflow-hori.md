---
id: "0523"
title: Fit screenshots to viewer width without horizontal scroll
type: bug
status: done
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fit-screenshots-to-viewer-width-without-
created_at: "2026-09-27T00:57:39Z"
updated_at: "2026-09-27T03:09:57Z"
---
## Problem

The full-size screenshot viewer renders every image at its natural pixel size
(`.shot-viewer-print img` uses `width: auto` / `max-width: none`) inside a
scroll container set to `overflow: auto` on both axes. Any screenshot wider than
the dialog therefore spills sideways: the user gets a horizontal scrollbar and
has to pan left and right to see the whole image, which is disorienting in a
stack and makes it easy to lose track of which screenshot you are looking at.
Vertical scrolling is the natural axis for a stack of images and should be what
remains.

## Desired UX

- Every screenshot fits the viewer's width, always — no horizontal scrollbar and
  no sideways panning, at any window size.
- Images keep their aspect ratio when scaled down; nothing is squashed, cropped,
  or clipped at either edge.
- Images smaller than the viewer keep their natural size rather than being blown
  up to fill it.
- The stack still scrolls **vertically**: image, caption, image, caption — you
  scroll down through the screenshots in order, and the shot you opened on is in
  view when the viewer appears.
- The header description and per-image captions remain accurate about what is on
  screen.

## Acceptance criteria

- [ ] With a screenshot wider than the viewer, the whole image is visible within
      the viewer's width and there is no horizontal scroll range / scrollbar.
- [ ] Scaling a wide screenshot down preserves its aspect ratio.
- [ ] A screenshot narrower than the viewer is not upscaled beyond its natural
      size.
- [ ] With multiple screenshots the container scrolls vertically through them in
      order, and the existing `startIndex` behaviour (opening scrolled to the
      clicked shot) still holds.
- [ ] The behaviour holds at narrow window widths, with the viewer's own padding
      accounted for — no image touches or overflows the container edges.
- [ ] The viewer's visible copy no longer claims images are shown "at their
      original size" if they are now scaled to fit; the description and captions
      stay truthful.
- [ ] Existing screenshot-viewer tests are updated to the new behaviour, and at
      least one regression test pins the fit-the-width / no-horizontal-scroll
      contract.
- [ ] `repoos check` passes.

## Notes for AI

Files to touch:

- `src/ui-app/src/components/ScreenshotViewer.vue` — scroller structure, the
  open-scroll-into-view watcher, and the dialog description copy.
- `src/ui-app/src/style.css` — the `.shot-viewer-scroll` and
  `.shot-viewer-print img` rules (around the `/* Full-size screenshot viewer */`
  block).
- `src/ui-app/tests/screenshot-viewer.test.ts` — the "renders every shot at
  natural size" case and the CSS wiring-contract block will need to match the new
  behaviour.

Constraints:

- **Assumption:** "fit the width" means scale *down* to the viewer's content
  width and never scale up. Smaller screenshots keep their natural pixel size.
- Constrain the axis on the scroll container, not by clipping image content: the
  container should scroll vertically only, with no horizontal scroll range.
- Keep viewer chrome CSS in `src/ui-app/src/style.css`, not a `<style scoped>`
  block in the component — dialog content is body-teleported (AGENTS.md) and the
  wiring-contract test asserts the component contains no `<style`.
- Do **not** add pan/zoom, a fit-width/original-size toggle, a new dialog, or any
  new UI affordance. This is a one-way change to always fit the width.
- Do not touch the expand buttons, the thumbnail/attachment grids, the
  open-in-new-tab affordance, or any attachment-serving code. This is
  presentation-only inside the viewer.
- Preserve the existing `startIndex` / `scrollIntoView` behaviour and the
  Escape / click-outside close.
- `ScreenshotViewer` is shared, so the fix lands on every screenshot surface at
  once (TaskDrawer pending and PM shots, NewInputPanel, InputsView, SettingsView
  bug report). Do not add per-call-site workarounds; verify through the existing
  test suite.
- Use the existing `var(--…)` design tokens; do not introduce hard-coded colours
  (check enforces the CSS layering and theme-contrast guards).

## Scope

In: the shared full-size screenshot viewer's image sizing, its scroll axis, and
any copy that becomes inaccurate as a result.

Out: thumbnail grids and attachment cards, the expand-to-open control,
download / open-in-new-tab, image zooming or panning, and any new viewer
affordance.

## Related

- `src/ui-app/src/lib/screenshot-viewer.ts` — the `ScreenshotShot` shape and
  helpers shared by the viewer's callers.
- AGENTS.md — dialog/Teleport CSS conventions and the shared-stylesheet rule.
- Existing tests: `src/ui-app/tests/screenshot-viewer.test.ts`.

## Original prompt

The screenshots should not overflow horizontally and require the horizontal scroll, they should fit the width, but they can scroll vertically (e.g. if there are multiple images they probably need to scroll vertically).

## Screenshots

![Screenshot-2026-09-27-at-00.33.15](/api/tasks/0523/attachments/screenshot-1.png)

## Activity

- 2026-09-27T00:57:39Z · created · hello@repoos.org
- 2026-09-27T00:57:40Z · screenshots
- 2026-09-27T00:58:11Z · status draft→inbox, title, area, type, body
- 2026-09-27T00:58:19Z · status inbox→ready
- 2026-09-27T02:45:56Z · status ready→active, branch
- 2026-09-27T02:47:26Z · status active→review
- 2026-09-27T03:09:57Z · status review→done, release:success
