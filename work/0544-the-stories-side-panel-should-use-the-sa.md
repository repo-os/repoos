---
id: "0544"
title: Match the story side panel to the other side panels' scrim and size
type: feature
status: done
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/match-the-story-side-panel-to-the-other-
created_at: "2026-09-27T07:41:41Z"
updated_at: "2026-09-27T10:14:44Z"
---
## Problem

The stories side panel (`src/ui-app/src/components/StoryPanel.vue`) is the only
right-hand side panel in the app with no scrim. It is declared `:modal="false"`
and renders no `DialogOverlay`, and it actively suppresses dismissal
(`@pointer-down-outside` / `@focus-outside` → `preventDefault`), so the page
behind it stays fully visible and clickable and a click on empty page chrome
does not close it.

Every sibling side panel does the opposite — a standard scrim plus click-to-
dismiss: the task drawer (`TaskDrawer.vue`), the input drawer in
`src/ui-app/src/views/InputsView.vue`, `NewStoryPanel.vue`, `NewDocPanel.vue`,
`NewSkillPanel.vue`, `NewInputPanel.vue`, `FloatingHeadPanel.vue` (Ross / CTO /
debugger, from #0435), `TunnelDrawer.vue` and `RemoteValidationDrawer.vue` all
render `<DialogOverlay />`, which is the shared `.overlay` rule in
`src/ui-app/src/style.css` (`position: fixed; inset: 0; background:
var(--overlay-bg); backdrop-filter: blur(3px); z-index: 90`) sitting under the
sheet's `.drawer-wrap` (z-index 100).

The result is a user-visible inconsistency with no discoverable reason: the same
gesture — open a detail panel, click away to dismiss it — works for tasks and
inputs but not for stories. Users reasonably read the difference as a bug, or
worse, as "this panel behaves differently on purpose", and stop being able to
predict the UI.

The same complaint applies one level up. Side panels are supposed to look and
size the same, but nothing enforces that, so each panel is free to hardcode its
own width or omit the drag edge. Most already bind `ui.drawerWidth` and render
the `.drawer-resize` handle wired to `ui.startResize`; the story panel already
does too, which is why only its scrim is visibly out of step today — but the
next panel added without a shared shell reintroduces the drift.

## Desired UX

- Opening any right-hand side panel — stories included — dims and blurs the page
behind it with the standard `.overlay` scrim, exactly like the task and input
panels, in every theme.
- Clicking that background closes the panel. So do `Escape` and the `×` in the
top-right corner. No panel is special-cased.
- All right-hand side panels share one shell: same default width
(`ui.drawerWidth`, currently 680px), same drag-to-resize left edge, same
`.drawer` sheet / border / shadow, same `.drawer-head` with `×` in the
top-right corner. Resizing one panel's width is reflected in the others,
because they all read the same store.
- The stories panel is otherwise unchanged: same tabs (Story · PM · Tasks ·
Details), same copy-link number and deep link, same in-place content swap
(tab strip reset to Story, body scrolled to top) whenever the selected story
changes.

## Acceptance criteria

- [ ] The stories side panel renders the standard scrim (`<DialogOverlay />`)
behind the sheet, picking up the shared `.overlay` styling — themed via
`var(--overlay-bg)`, z-index below `.drawer-wrap`.
- [ ] Clicking the scrim closes the stories panel.
- [ ] `Escape` and the `×` still close the stories panel, and focus returns to
the story row that opened it.
- [ ] The stories panel is no longer declared `:modal="false"`, and the
`keepOpenOnOutsideInteraction` handlers on `@pointer-down-outside` /
`@focus-outside` are removed (along with the function itself if nothing
else references it — do not leave dead code).
- [ ] The in-place content swap is retained and still covered: when the selected
story changes by a route that is not a click behind the scrim (deep link
`/stories?story=…`, story → task navigation, programmatic selection), the
same dialog shows the new story with the tab strip reset to the first tab
and the body scrolled to the top.
- [ ] Audit complete: every right-hand side panel binds `ui.drawerWidth` and
renders the `.drawer-resize` handle wired to `ui.startResize`. Any panel
that hardcodes a width or omits the handle is converted to the shared
binding; the list of panels checked and anything changed is recorded in
this task's transcript.
- [ ] Audit complete: every right-hand side panel renders `<DialogOverlay />`,
except where a recorded reason makes it impossible (e.g.
`ScreenshotViewer`, which deliberately sits at a higher z-index). List any
exceptions and their reasons in the transcript.
- [ ] No per-panel width override survives: the default width for panels already
on `ui.drawerWidth` stays 680px, and the resize clamp in
`src/ui-app/src/stores/ui.ts` (`Math.max(360, Math.min(innerWidth - 40, …))`)
is unchanged.
- [ ] `src/ui-app/tests/story-panel.test.ts` updated: the assertions
"declares the panel non-modal, with no scrim to block the list" and "blocks
both of radix's outside-dismissal paths" are replaced with assertions that
the scrim is present, that a scrim click dismisses the panel, and that the
in-place swap still resets tab and scroll.
- [ ] `src/ui-app/tests/deep-link-params.test.ts` still passes — it locates the
story drawer by its tablist, and a modal dialog adds a body
pointer-events lock, so it may need the same shim the other modal-drawer
tests use.
- [ ] `repoos check` passes in full (format, lint, build, tests, WebKit smoke),
including the CSS-layering and theme-contrast guards.

## Notes for AI

- **The one deliberate trade, and the assumption behind it.** The story panel's
header comment (`StoryPanel.vue` lines ~1–46) and #0502's spec justify
non-modal as the only way to let a user click a *second* story row and swap the
panel's contents in place. An opaque scrim makes that literally unreachable —
the list behind it can no longer receive pointer events. Assumption, stated
explicitly because it is a real behaviour loss: **the scrim wins.** The user
asked for parity with the other panels and the swap is preserved on every
other route. Do **not** invent replacement navigation (prev/next controls, a
story list inside the panel, a "swap mode" toggle) to paper over the lost
click-to-swap. If you judge it a regression worth keeping, say so in the
handoff and file it as a follow-up task instead.
- Rewrite the header comment so it describes the new behaviour. Delete the
now-false claims: "renders no scrim", "NON-MODAL", "The cost is that a click
on empty page chrome no longer closes the panel", and the `keepOpenOnOutsideInteraction`
rationale. Keep the parts that are still true (shared `ui/dialog/*` frame,
`ui.drawerWidth` + `ui.startResize`, shared `style.css` classes).
- Concrete edit for the story panel: drop `:modal="false"` from `<Dialog>`, add
`<DialogOverlay />` (import from `./ui/dialog/overlay.vue`) inside the
`<Dialog>` before `<DialogContent>`, and remove both
`@pointer-down-outside` / `@focus-outside` bindings. Nothing else about the
panel needs to change — it already uses the shared `DialogContent`,
`ui.drawerWidth`, `.drawer-resize`, `.drawer-head` and `.drawer-tabs`, so it
is already visually identical to the task/input sheets once the scrim is back.
- The scrim styling comes free and themed: `ui/dialog/overlay.vue` renders
`.overlay` from `style.css`, whose `--overlay-bg` is already defined per
light/dark theme. Do **not** add per-panel overlay CSS or a literal colour —
the theme-contrast guard in the check plan will (correctly) fail it.
- Start the audit from what already exists rather than re-deriving it: panels
already rendering `<DialogOverlay />` with `ui.drawerWidth` + `.drawer-resize`
are `TaskDrawer`, the input drawer in `InputsView`, `NewStoryPanel`,
`NewDocPanel`, `NewSkillPanel`, `NewInputPanel`, `FloatingHeadPanel`,
`TunnelDrawer` and `RemoteValidationDrawer`. Confirm them, then look for the
outliers.
- Leave genuinely different surfaces alone: centred modals and cards
(`.dep-overlay`, `.restart-overlay`, `.hotfix-overlay`, `.dirty-overlay`,
`SearchOverlay`, `ScreenshotViewer`), the freeform New task dialog nested
inside `TaskDrawer`, and any panel that is an anchored popover or dropdown
rather than a right-hand sheet.
- If the audit turns up another panel whose difference is deliberate and
load-bearing (the story panel's was), do not quietly change it — record it in
the transcript with the reason, and file a task if it deserves one.
- Conventions: the overlay is body-teleported via radix `DialogPortal`, so its
CSS stays in `style.css`, not in the component's `<style scoped>`. No new
runtime dependencies. After any UI change run `bun run build:ui` (or
`bun run build`) so the worktree build is fresh, then `repoos check`.
Per `AGENTS.md`, do not run `repoos serve` and do not auto-request a preview —
emit `::repoos-preview-request::` only if the human asks to see it in a
browser.

## Scope

- **In scope:** the stories panel's scrim and click-to-dismiss parity; the
width / shell / overlay audit across right-hand side panels plus the fixes it
turns up; the test and header-comment updates that go with them.
- **Deferred:** centred modals, popovers and dropdowns; any new in-panel story
navigation; changing the default panel width or the resize behaviour;
per-theme scrim tuning; any change to the content, tabs or deep-link
behaviour of the stories panel.

## Related

- #0502 (done) — added the stories side panel; source of the deliberate
non-modal decision this task reverses.
- #0515 (done) — story numbers and deep links in the panel header.
- #0435 (done) — "Unify floating head agent panels with tasks/inputs style":
the same unification applied to the floating head panels. `StoryPanel` is the
remaining holdout.
- #0208, #0416 (done) — earlier passes at the same "side panels should match"
complaint, and useful precedent for how the team wants these resolved.
- `src/ui-app/tests/story-panel.test.ts` — contains the assertions this task
must update.

## Original prompt

The stories side panel should use the same styling as the other side panels (e.g. like tasks, inputs etc) where there's an opaque background which is clickable to close an open story panel. And in general the size and style of the side panels should be similar so users don't wonder why they're different unnecessarily.

## Activity

- 2026-09-27T07:41:41Z · created · hello@repoos.org
- 2026-09-27T07:43:15Z · status draft→inbox, title, area, body
- 2026-09-27T08:13:09Z · status inbox→ready
- 2026-09-27T08:13:10Z · status ready→active, branch
- 2026-09-27T08:17:48Z · status active→review
- 2026-09-27T10:14:44Z · status review→done, release:success
