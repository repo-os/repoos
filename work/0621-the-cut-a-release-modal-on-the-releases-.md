---
id: "0621"
title: Convert cut-a-release flow from modal to side panel with persistent progress
type: feature
status: done
priority: p2
area: web
merged_commit: 3a28c47c34c2dc5f265f3b53ab754e515d989f8e
assigned_to: ai
created_by: hello@repoos.org
branch: feat/convert-cut-a-release-flow-from-modal-to
created_at: "2026-10-02T01:44:49Z"
updated_at: "2026-10-02T02:18:51Z"
---
## Problem

The **Cut a release** flow on the Releases page lives in a centered modal (`ReleasesView.vue`). The form has grown (version, notes, AI draft, publish actions, progress log, errors, debugger hooks, distribution hints, etc.), so the modal feels cramped and hard to scan. Long-running work (notes drafting ~1–3 minutes, publish/cut ~5 minutes) makes it more important that operators can dismiss the UI without losing context — today, opening the flow resets several fields (`openRelease()` clears version, notes, logs, and related flags), so closing and returning does not reliably restore an in-progress cut or the operator’s half-filled form.

## Desired UX

- Replace the cut-a-release **modal** with a **right-hand side panel** matching the task drawer and **New input** panel: same drawer chrome (`drawer-head`, `drawer-body`, resize handle if applicable), shared global styles, and the **opaque scrim** behind the panel.
- Clicking the scrim **closes** the panel, same as the **X** in the upper right.
- While a release cut or notes draft is running (or the operator has entered version/notes but not published), closing the panel must **not** discard progress:
  - Reopening **Cut a release** shows the same in-flight or recently failed state, live log/progress, and form fields as before close.
  - Progress stays **up to date** (continue or resume polling against existing release/notes run APIs while appropriate) so a user who leaves for several minutes and returns sees current status without restarting the flow.
- The Releases list/page behind the panel remains usable when the panel is closed (same mental model as closing the task drawer).

## Acceptance criteria

- [ ] **Cut a release** opens a side panel (not a centered modal) on the Releases page, visually consistent with the task drawer and New input panel (headline, close control, scrollable body).
- [ ] The panel uses the shared drawer/scrim pattern: opaque backdrop; **click outside the panel (scrim) closes** it; upper-right close does the same.
- [ ] All existing cut-a-release capabilities remain available in the panel (suggested version, notes field, Generate with AI, publish/cut, progress, errors, related hints) without functional regression.
- [ ] Closing the panel during an **in-progress release cut** does not clear run state; reopening shows current phase, log, and status aligned with `GET /api/release/run` (and related endpoints).
- [ ] Closing the panel during **in-progress notes drafting** does not clear draft/run tracking; reopening shows drafting progress or the finished draft per server state (`GET /api/release/notes/run` / cache behavior from #0605).
- [ ] Closing the panel with **user-entered but unpublished** version/notes preserves those values on reopen (no full reset on close).
- [ ] After UI changes: `bun run build:ui` (or full build); run fmt/lint as needed; update or add UI tests if this surface is already covered.

## Notes for AI

- Primary file: `src/ui-app/src/views/ReleasesView.vue` (today: Radix `Dialog` + `.release-modal` classes in `src/ui-app/src/style.css` ~`.release-modal.*`). Reference implementations: `TaskDrawer.vue` and `NewInputPanel.vue` (body-teleported `Dialog` + `drawer-head` / `drawer-body` / `DialogOverlay`).
- Follow AGENTS.md overlay rules: teleported layers and `data-overlay-layer` where hand-rolled; prefer shared dialog components.
- **Assumption:** “Come back” means reopening **Cut a release** on the same Releases page session (not a new browser tab after full reload). Persist state in the view or a small store module scoped to Releases; rely on existing server-tracked runs for truth during long cuts (#0605). Avoid resetting on `confirmOpen` → false unless starting a **new** cut after a successful publish or an explicit “start over” if one already exists.
- Review `openRelease()` and any watchers tied to modal open — they currently reset fields; adjust so close ≠ new session, while still syncing server run state on reopen (`syncNotesRunAtOpen`, release run polling).
- Migrate or replace `.release-modal` CSS in `style.css` to drawer panel classes; do not leave duplicate modal-only layout.
- **Do not** change release pipeline semantics, API contracts, or notification behavior (#0606) unless required for UI wiring.
- Optional copy from #0604 may be shortened or relocated once persistence is real; do not treat copy-only work as the main deliverable.

## Scope

- In scope: Releases page cut-a-release **presentation** (modal → side panel), scrim dismiss, and **client state persistence** across panel close/reopen during long operations.
- Out of scope: new release features, server changes to run tracking, notifications, mobile/landing layouts unless broken by the panel swap.

## Related

- #0604 — modal copy about leaving mid-run (may need light edit after this ships)
- #0605 — server-tracked notes runs (source of truth for draft progress)
- #0575 — overlay click-through / `data-overlay-layer` conventions

## Original prompt

The "cut a release" modal on the Releases page is getting big now (lots of content) so it would be better if we made it into a side panel instead (like tasks, inputs side panel - re-use the same styling and opaque background which on click closes it same as the close button in the upper right). Also keep the state/context of the release panel so if the user is in the middle of a release (since it takes quite a few minutes) if they close out of the release panel and come back it's still showing all the relevant and up-to-date info about the release progress.

## Screenshots

![Screenshot-2026-10-02-at-09.42.05](/api/tasks/0621/attachments/screenshot-1.png)

## Activity

- 2026-10-02T01:44:49Z · created · hello@repoos.org
- 2026-10-02T01:44:50Z · screenshots
- 2026-10-02T01:45:43Z · status draft→inbox, title, area, body
- 2026-10-02T01:53:35Z · status inbox→ready
- 2026-10-02T01:53:47Z · status ready→active, branch
- 2026-10-02T02:10:12Z · status active→review
- 2026-10-02T02:18:51Z · status review→done, release:success
