---
id: "0267"
title: Confirm-before-run modal for the canary trigger
type: feature
status: review
priority: p3
area: ui
assigned_to: ai
created_by: ""
branch: feat/confirm-before-run-modal-for-the-canary-
created_at: "2026-08-24T15:55:05Z"
updated_at: "2026-08-24T20:47:25Z"
---
## Problem

Clicking the canary egg button in the sidebar fires the freeform task-create call immediately, with no confirmation. That's a real (billed) agent run kicked off by a misclick.

## Fix

Clicking the egg opens a modal first: explain what the canary task does (walks draft → inbox → ready → active → review → merge → done with a trivial one-line diff to `src/core/canary.ts`) and require a confirm before calling `createFreeformTask`.

## Scope

All changes live in `src/ui-app/src/components/Sidebar.vue` (+ the dialog's CSS). No engine/core or server changes.

### Component: a `CanaryConfirmDialog.vue`

Follow the modern `ui/dialog` conventions already used by `AgentModelModal.vue` and `TaskDrawer.vue` (radix-vue primitives), **not** the older hand-rolled `.overlay`/`.card` pattern of `RestartTaskDialog.vue`:

- `import Dialog from "./ui/dialog/root.vue"` plus `DialogClose`, `DialogContent`, `DialogDescription`, `DialogOverlay`, `DialogTitle`, and the shared `Button` from `./ui/button.vue` (variants: `outline` cancel, `accent`/`destructive` confirm).
- Props: `open: boolean`; emits `update:open` and `confirm`.
- Dialog title: e.g. "Run the canary flow test?"
- Body copy must cover:
  - Clicking the canary starts a **real, billed agent run** — it is not preview-only.
  - The canary task is deliberately trivial: it walks draft → inbox → ready → active → review → merge → done.
  - The only change is a **one-line diff** to `src/core/canary.ts`: increment `CANARY_COUNTER` by 1 (wrapping 9 → 0) — nothing else, no tests/comments, and `CANARY_PROMPT` itself stays untouched.
- Actions: **Cancel** + a confirm button ("Create canary task"). While the create request is in flight, disable both buttons and show "Creating…". The confirm handler should `await` whatever the parent passes (see below) so the busy state reflects reality.

### Wire it into `Sidebar.vue`

- Introduce a `canaryOpen = ref(false)`.
- The `.canary-egg` button's `@click` becomes `canaryOpen = true` (instead of calling `runCanary` directly). Keep the existing `:disabled="canaryRunning"` and `.busy` guard; the egg must stay inert while a run is already in flight.
- Render `<CanaryConfirmDialog :open="canaryOpen" @update:open="canaryOpen = $event" @confirm="runCanary" />`.
- `runCanary()` keeps its existing guard (`if (canaryRunning.value) return;`) but now also closes the dialog first, e.g. `canaryOpen.value = false;` before firing `repo.createFreeformTask(CANARY_PROMPT)`. Keep the existing success/failure toast behavior (`.pushToast` + silent catch in `finally`).

### CSS

Add styles for the dialog (`ui/dialog` classes already provide the overlay/portal/positioning) in `src/ui-app/src/style.css` following the existing BEM-ish class naming — the modal should match the look of `AgentModelModal` rather than introduce a bespoke layout (the newer components are being standardised on radix-vue dialogs; see `#0202` Tailwind conversion context).

## Acceptance criteria

1. Clicking the canary egg opens the confirmation modal; it does **not** call `createFreeformTask`.
2. The modal explains that this is a real billed run, describes the draft → … → done walk, and states the one-line diff to `src/core/canary.ts`.
3. Cancel (or closing the dialog) results in no task being created.
4. Confirm creates the canary task exactly as before (same prompt, same toast), and the button enters a busy state during the request.
5. Guardrails preserved: the egg stays disabled while a canary is already running; only one canary task can be in flight.
6. `repoos check` passes (build + UI smoke test).

## Notes / decisions

- Reuse the existing `CANARY_PROMPT` from `src/core/canary.ts` — do not reword it; the prompt text is referenced in the flow and documented as "exact, unchanging".
- Accessibility: use `role="dialog"`/`aria-modal` (the radix primitives handle this), label the confirm button clearly, and focus management comes free from the dialog primitive.
- This is a pure safety UX change; it does not alter the canary task semantics or `src/core/canary.ts`.

## Activity

- 2026-08-24T15:58:30Z · body
- 2026-08-24T20:25:53Z · body
- 2026-08-24T20:28:15Z · status inbox→ready
- 2026-08-24T20:36:50Z · status ready→active, branch
- 2026-08-24T20:47:25Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
