---
id: "0571"
title: Hide PM working UI on freeform create and tidy screenshot hint
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/hide-pm-working-ui-on-freeform-create-an
pm_cli_override: cursor
pm_model_override: composer-2.5
created_at: "2026-09-28T06:11:24Z"
updated_at: "2026-09-28T08:05:09Z"
---
## Problem

After the user clicks **Create task** in the New task panel (freeform mode), a PM “working” card appears at the bottom of the panel—the live **PM agent** stream (`ff-stream`) and/or the stream block inside the **Creating your task** acknowledgment (`ff-done`). That surface is redundant: once the PM starts producing output, the user is expected to follow progress on the new task’s **PM** tab in the task drawer, which already shows the same run. Many users close the New task panel or navigate away before any lines appear, so the bottom card often looks empty, flickery, or broken rather than helpful.

Separately, the Screenshots field in the New task form shows a long inline hint when the dropzone is empty: “PNG, JPEG, GIF, WebP, AVIF or BMP — attached to the new task when you create it.” That copy clutters the form; format/attachment help should be available on demand without a permanent paragraph.

## Desired UX

**Freeform create**

- Clicking **Create task** should not leave a PM working / PM agent stream card pinned at the bottom of the New task panel. Progress belongs on the created task (PM tab) or other existing indicators—not a duplicate card in the create flow.
- Users who dismiss the New task panel immediately after submit should not see a misleading “working” affordance that never populated.
- Preserve the useful parts of the current flow where they still matter (e.g. acknowledgment that creation continues in the background, **Create another task** / **Done**, auto-open when the PM run finishes if that behavior already exists)—only remove the redundant bottom PM working/stream card tied to create.

**Screenshots (New task)**

- Remove the always-visible `shot-hint` paragraph under the Screenshots dropzone when no images are selected.
- Keep the **Screenshots** label; add a small info control beside it that reveals the former hint text (accepted formats and that files attach to the task on create) in a **styled** hover/focus popup—same quality bar as other non-native tooltips in the app (e.g. the integration bar’s teleported hover pane in `IntegrationStatusBar.vue`), not a bare HTML `title` tooltip.

## Acceptance criteria

- [ ] After submitting a freeform **Create task**, the New task panel no longer shows the bottom PM working / PM agent live-stream card (the `ff-stream` block and equivalent stream section in the acknowledgment state, as applicable).
- [ ] Freeform create still succeeds; PM flesh-out still runs server-side; opening the new task’s PM tab still shows live output when the user chooses to follow it.
- [ ] Existing tests for freeform submit/ack (`freeform-submit-ack.test.ts` and related) are updated so they no longer require the removed stream UI, and still cover the behaviors that remain.
- [ ] The empty-state Screenshots line “PNG, JPEG, GIF, WebP, AVIF or BMP — attached to the new task when you create it.” is not shown as static copy under the dropzone.
- [ ] An info icon (or equivalent) next to the Screenshots label opens a themed tooltip/popover on hover (and keyboard-accessible focus) with that information; styling matches established in-repo popup patterns, not the browser default tooltip.
- [ ] After UI changes, `bun run build:ui` (or full build) so `dist/ui` is fresh; `repoos check --changed main` passes.

## Notes for AI

- Primary touchpoint: `src/ui-app/src/components/TaskDrawer.vue` (New task freeform path: `freeformSubmitted` / `ff-done`, `freeformLines` / `ff-stream` below the button row). Confirm against the task attachment screenshot which exact bottom card the reporter meant; do not remove board-card **PM is working** hints (`TaskCard.vue`, #0335) or the PM-tab **ActivityIndicator** on an open task unless the screenshot clearly shows those and the change is scoped here—this task is about the **create** panel experience.
- Screenshot hint today: `shot-hint` paragraph ~line 2845 in `TaskDrawer.vue`; label at ~2804.
- Reuse existing global form / dialog styling (`src/ui-app/src/style.css`, shared `field` patterns). Teleport body-level overlays if the tooltip uses `position: fixed` (per `AGENTS.md`).
- Do not change accepted MIME types or upload behavior—copy/UX only for the hint.
- Assumption: the acknowledgment panel’s headline/copy and **Done** / **Create another task** actions stay unless they duplicate the removed stream card entirely; trim only the redundant PM stream portion.

## Scope

**In scope:** New task panel (freeform create) PM working/stream card at the bottom; Screenshots empty-state hint → info tooltip on the New task form.

**Out of scope:** Reworking PM working indicators on board cards, PM chat elsewhere, or the same `ff-stream` pattern on New doc/skill/story panels unless explicitly requested later.

## Related

- #0311 — freeform submit acknowledgment panel
- #0335 — PM working indicator on tasks/cards
- #0123 — screenshot uploads on New task
- #0460 — styled hover panes (`IntegrationStatusBar.vue`)

## Original prompt

Don't show the PM working card at the bottom when the user clicks create task, because as soon as the PM starts generating something the new task tab opens anyway, and also most users will click away before the PM starts printing anything, so it just looks like a bad ui right now... also please remove this line of text at the screenshots: `PNG, JPEG, GIF, WebP, AVIF or BMP — attached to the new task when you create it.`  if necessary just show a little info icon  next to the label which on hover shows a properly stylised tooltip (see other examples of good popups in this repo, not the default html tooltip which is not a good ux).

## Screenshots

![Screenshot-2026-09-28-at-14.08.01](/api/tasks/0571/attachments/screenshot-1.png)

## Activity

- 2026-09-28T06:11:24Z · created · hello@repoos.org
- 2026-09-28T06:11:25Z · screenshots
- 2026-09-28T06:13:19Z · status draft→inbox, title, area, body
- 2026-09-28T06:31:00Z · status inbox→ready
- 2026-09-28T06:31:02Z · status ready→active, branch
- 2026-09-28T06:43:30Z · status active→review
- 2026-09-28T08:05:09Z · status review→done, release:success
