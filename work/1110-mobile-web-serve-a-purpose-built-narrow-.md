---
id: "1110"
title: "Mobile web: serve a purpose-built narrow-screen UI instead of the stretched desktop layout (ADR and first slices)"
type: feature
status: active
priority: p1
area: [web, docs]
assigned_to: ai
created_by: t@t
branch: feat/mobile-web-serve-a-purpose-built-narrow-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T09:06:53Z"
updated_at: "2026-11-14T09:13:57Z"
deferred_handoff_resume_count: 1
---
## Problem
On narrow screens RepoOS serves the desktop UI squeezed by scattered `@media (max-width)` rules (22 files in src/ui-app/src, 18 in style.css alone). It works but feels hacky: dense columns, hover-only affordances, small controls, desktop chrome. The existing mobile docs (docs/mobile-ux-strategy.md, docs/mobile-architecture.md) and tasks #0300, #0302, #0303, #0304 assume a native iOS/Android shell instead. The product direction from Nick is that mobile stays on the **web app**: the same SPA, but on narrow screens it serves a mobile-friendly design built for phones.

## Desired UX
Open RepoOS in a phone browser (or add it to the home screen) and get a layout designed for a phone: a bottom navigation bar, a single-column Work queue with readable cards, task details as a full page or bottom sheet, large touch targets, no hover-only actions, and no horizontal scroll. Desktop is unchanged. Tablets get a sensible choice documented in the ADR.

## Acceptance criteria
1. Write `docs/adr/NNNN-mobile-web-ui.md` deciding: how the app switches to the mobile composition (breakpoint and/or touch capability, one SPA with separate mobile components, not a fork), the mobile navigation model, which existing responsive CSS is kept or removed, and PWA install basics. State plainly that this supersedes the native-shell direction in docs/mobile-ux-strategy.md and docs/mobile-architecture.md, and update those two docs to say so and link the ADR; do not edit other tasks.
2. Inventory what exists: capture the current Work, task drawer, Settings, Releases and Activity pages at 390x844 and 768x1024 with `repoos shot`, and list the concrete problems (overflow, tiny targets, hover-only controls) in the ADR.
3. Break the work into 4 to 6 small, independent follow-up tasks (mobile shell and bottom nav, Work queue, task detail sheet, Settings, touch fixes including #1069), each filed with `repoos new` as a complete spec with acceptance criteria, in dependency order. Do not implement them in this task.
4. Include a short list of which of #0300, #0302, #0303, #0304 should be closed, rewritten or kept, with reasons, for Nick to decide. Do not change them.
5. No behaviour change in this task beyond the docs and the filed tasks; `repoos check` passes.

## Notes for AI
Read docs/mobile-ux-strategy.md, docs/mobile-architecture.md and docs/agent-ui-and-preview-conventions.md first. Follow AGENTS.md conventions (shared dialogs, no native alert, teleported overlays carry data-overlay-layer). Prefer a mobile composition under src/ui-app/src/views/ and components/ selected by a small layout composable, reusing the shared task store and mutations. Keep the plan small enough that each follow-up lands in under a day.

## Activity

- 2026-11-14T09:06:53Z · created · t@t
- 2026-11-14T09:06:56Z · cli_override, model_override
- 2026-11-14T09:06:58Z · status inbox→ready
- 2026-11-14T09:06:59Z · status ready→active, branch
- 2026-11-14T09:09:47Z · message_queued at 2026-11-14T09:09:47.874Z
- 2026-11-14T09:11:49Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-14T09:13:57Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-14T09:13:57Z · message_queued at 2026-11-14T09:13:57.575Z
- 2026-11-14T09:13:57Z · ↻ resuming engineer to read queued message
