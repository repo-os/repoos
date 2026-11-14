---
last_close_out_gate_ms: 61303
last_close_out_gate_at: "2026-11-14T10:52:40.891Z"
id: "1110"
title: "Mobile web: serve a purpose-built narrow-screen UI instead of the stretched desktop layout (ADR and first slices)"
type: feature
status: review
human_step_decision: agent
human_step_decision_key: 22f77011
priority: p1
area: [web, docs]
assigned_to: ai
created_by: t@t
branch: feat/mobile-web-serve-a-purpose-built-narrow-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T09:06:53Z"
updated_at: "2026-11-14T10:52:40Z"
review_passes: 2
---
## Problem
RepoOS currently serves its desktop SPA on phones and relies on scattered `@media (max-width)` rules to squeeze desktop surfaces into a narrow viewport. The connected-server UI feels cramped, with dense columns, hover-only affordances, small controls and desktop chrome. The product direction is to keep mobile as the server's **web app**: the same SPA serves purpose-built narrow-screen layouts in a phone browser, in the Capacitor shell's isolated WebView, and as an installed home-screen web app. This changes the connected-server presentation only; the native Capacitor multi-server picker, lock screen and WebView isolation/security architecture remain in scope and valid.

## Desired UX
Open RepoOS on a phone and get a layout designed for a phone: bottom navigation, a single-column Work queue with readable cards, task details as a full page or bottom sheet, large touch targets, no hover-only actions, and no horizontal scroll. The same server-served experience appears in a plain phone browser, inside the Capacitor host's isolated WebView, and when installed to the home screen. The Capacitor host still selects the server and enforces its isolation boundary. Desktop is unchanged. Tablets get a sensible choice documented in the ADR.

## Acceptance criteria
1. Write `docs/adr/0011-mobile-web-ui.md` deciding how the server-served SPA switches to a purpose-built narrow composition (breakpoint and/or touch capability; one SPA with distinct mobile components, not a fork), the web UI navigation model, which existing responsive CSS is kept or removed, tablet behavior, and PWA install basics. State plainly that this supersedes only the connected-server shell and screen-composition direction in `docs/mobile-ux-strategy.md`. Keep `docs/mobile-architecture.md` valid: the Capacitor host's multi-server picker, lock screen and isolated WebView security model remain. The same narrow-screen UI must work in a plain phone browser, inside that isolated WebView, and as an installed home-screen web app. Update the UX strategy to link the ADR and clarify the boundary; do not edit other tasks.
2. Inventory what exists: capture the current Work, task drawer, Settings, Releases and Activity feed at 390x844 and 768x1024 with `repoos shot`, and list concrete problems (overflow, tiny targets, hover-only controls) in the ADR.
3. Break the work into 4 to 6 small, independent follow-up tasks (web navigation shell, Work queue, task detail sheet, Settings, touch fixes including #1069), each filed with `repoos new` as a complete spec with acceptance criteria, in dependency order. Do not implement them in this task or replace the native multi-server picker.
4. Include a short list of which of #0300, #0302, #0303, #0304 should be closed, rewritten or kept, with reasons, for Nick to decide. Treat #0300 and the native picker/host responsibilities as likely keep; treat the native connected-server shell/screens in #0302 and the screen composition in #0303 as likely rewrite or close; assess #0304 as likely rewrite or close while preserving any host-session requirements still needed. Do not change those four tasks.
5. No behavior change in this task beyond the docs and filed tasks; `repoos check` passes.

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
- 2026-11-14T09:13:57Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The scoped check passed. It treated this as a docs-only change, so formatting and task parsing ran while build, lint, tests and UI smoke were correctly skipped. I added task IDs to the ADR after that run, so I’m doing one final scoped chec… · stderr: Reading additional input from stdin...
- 2026-11-14T09:13:58Z · message_delivered: 2 message(s)
- 2026-11-14T09:16:16Z · body: Acceptance criteria (added 5, removed 5)
- 2026-11-14T09:16:16Z · message_queued at 2026-11-14T09:16:16.143Z
- 2026-11-14T09:16:36Z · body: Problem (added 1, removed 1)
- 2026-11-14T09:16:36Z · message_queued at 2026-11-14T09:16:36.392Z
- 2026-11-14T09:16:38Z · body: Desired UX (added 1, removed 1)
- 2026-11-14T09:16:38Z · message_queued at 2026-11-14T09:16:38.347Z
- 2026-11-14T09:16:49Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-14T09:18:16Z · handoff_deferred: 3 queued message(s) must be read before review
- 2026-11-14T09:18:16Z · message_queued at 2026-11-14T09:18:16.208Z
- 2026-11-14T09:18:16Z · ↻ resuming engineer to read queued message
- 2026-11-14T09:18:16Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The ADR now retains the native picker, lock screen and WebView isolation, and says the same server-served narrow layout works in browser, Capacitor WebView and installed web app. I also restored `mobile-architecture.md` to its original con… · stderr: 2026-11-14T09:15:01.124481Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/mobile-web-serve-a-purpose-built-narrow-/docs/adr/0011-mobile-web-ui.md: `mobile-ux-strategy.md`](../mobile-ux-strategy.md) and [`mobile-archi…
- 2026-11-14T09:18:16Z · message_delivered: 4 message(s)
- 2026-11-14T09:19:11Z · CTO nudge: held — handoff gate is running
- 2026-11-14T09:20:14Z · status active→review
- 2026-11-14T09:20:15Z · note: shots: skipped — 19 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-11-14T09:20:15Z · note: shots: skipped — 19 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-11-14T09:20:17Z · message_queued at 2026-11-14T09:20:17.668Z
- 2026-11-14T09:21:36Z · note: review pass 2: good to go
- 2026-11-14T09:22:23Z · status review→active
- 2026-11-14T09:22:25Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-14T10:18:47Z · message_delivered: 1 message(s)
- 2026-11-14T10:24:05Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Handoff passed. Task #1110 is now in review, so no further work is needed in this turn. · stderr: Reading additional input from stdin... 2026-11-14T10:18:52.610480Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out
- 2026-11-14T10:44:49Z · note: handoff requested (cli)
- 2026-11-14T10:45:42Z · status active→review
- 2026-11-14T10:45:42Z · note: shots: skipped — 19 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-11-14T10:45:42Z · message_queued at 2026-11-14T10:45:42.907Z
- 2026-11-14T10:45:43Z · note: shots: skipped — 19 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-11-14T10:47:02Z · note: review pass 3: good to go
- 2026-11-14T10:52:40Z · close-out gate completed in 61s

