## TL;DR

Task 1195 shipped a targeted accessibility fix to the app-wide toast surface (`ToastPanel.vue`): the notification stack is now a named, polite, non-atomic live region, each toast carries urgency by type (errors announce as `alert`, successes/info as `status`), and dismiss buttons name the message they dismiss. A new component regression test pins these semantics, and `docs/qa/2026-11-notifications-banners.md` records the pass and its coverage boundaries. One engineering round, one review pass (verdict: good to go), close-out completed, task done and merged.

## Outcome

The task asked for a QA pass over notifications, toasts, error banners and their dismissals across the app, driven only through a headless-browser no-auth dev server, with bugs fixed alongside tests and the QA note committed under `docs/qa/`.

What shipped:

- **`src/ui-app/src/components/ToastPanel.vue`** (+6/−3): replaced the container-level `aria-live="assertive"` / `aria-atomic="true"` configuration with a named ("Notifications"), polite, non-atomic region; added per-toast live roles (error → `alert`, success/info → `status`); dismiss buttons now include the toast text in their accessible name. This stops stacked-toast updates from interrupting screen readers and re-announcing already-heard messages.
- **`src/ui-app/tests/toast-panel-a11y.test.ts`** (new, +27): component-level regression test covering the region name, live-region settings, per-toast roles and contextual dismiss names.
- **`docs/qa/2026-11-notifications-banners.md`** (new, +24): the required QA note, documenting the targeted scope and explicitly listing which other banner/error surfaces were not audited.

Verification: the built UI was served from the task worktree and mounted by headless Playwright Chromium with no page exceptions; the new component test plus the existing toast-store lifecycle tests passed; one handoff shot was captured with a clean browser console; the close-out gate completed successfully.

Final verdict: **good to go** (review pass 1). Status: **done**, merged as commit `d2107aa7dce446edbb315bce7a590fcc802255f1` on branch `feat/qa-pass-notifications-toasts-and-error-b`.

## Process stats

- **Engineering rounds:** 1 (round 1, completed 2026-11-18T19:11:44.834Z).
- **Review passes:** 1 (pass 1, 2026-11-18T19:12:09.887Z, verdict "good to go"). No re-reviews were needed.
- **Wall-clock start → done:** created 2026-11-18T18:47:48Z, done 2026-11-18T19:14:46Z — 26 minutes 58 seconds.
- **Agents and models (per recorded sessions):**
  - Engineer: `engineer`, model `gpt-6-luna`, started 18:47:55Z, elapsed 502s, 5,526,899 tokens. Cost: not recorded.
  - Reviewer: `reviewer`, model `gpt-6-luna`, started 19:11:47Z, elapsed 23s, 195,849 tokens. Cost: not recorded.
  - Routing: two "Model router (openrouter)" calls (1s and 0s), model recorded as unknown, tokens not recorded.
- **Restarts or model swaps:** none recorded.
- **Automated gates:** close-out gate completed in 81s (2026-11-18T19:14:20Z). Handoff capture at 19:11:37Z passed the browser console-error check. Guard negative-test evidence was skipped (no check-guard rules changed on the branch).
- **Shots:** 1 captured, clean console.

## What went wrong

- **Handoff gate ran long enough to trigger a CTO nudge.** At 18:59:14Z (11m 21s after the engineer started) the CTO held the task with "handoff gate is running". The gate did complete on its own — the round finished and the task moved `active→review` at 19:11:45Z, at which point the hold cleared. No manual intervention was recorded.
- **Default no-auth dev port occupied.** Port 7272 was already in use, so the engineer left that listener untouched and ran the worktree's server on 7382, stopping it afterwards via its own session interrupt.
- **No toast appears on dashboard load.** The live app emitted no toast during the initial page load, so the headless shell check could not exercise interactive dismissal directly; that behavior is covered by the component test and store tests instead, and the QA note states this boundary explicitly. Resolved by scoping claims honestly rather than forcing a repro.
- No crashes, flaky checks, failed handoffs or restarts were recorded.

## Learnings

- **Container-level live regions are wrong for toast stacks.** `aria-live="assertive"` + `aria-atomic="true"` on the list makes every mutation interrupt the user and replay all stacked messages. Urgency belongs per-toast: errors as `alert`, routine outcomes as `status`. Durable and reusable — a natural addition to `docs/agent-ui-and-preview-conventions.md` (accessibility conventions section).
- **Dismiss controls should name their target.** With several identical icon-only close buttons stacked, each button's accessible name should identify the message it dismisses. Same destination as above.
- **Browser shell checks and component tests answer different questions.** A headless page-load proves the app serves and mounts; it does not prove a transient UI element (like a toast) appeared or behaves correctly. Rendered semantics need a component test. Worth one line in `docs/agent-ui-and-preview-conventions.md` so future QA passes state their evidence boundaries the same way.
- **Port collision handling:** when the default no-auth port is taken, run the scratch server on another port rather than disturbing the existing listener (consistent with the existing `just serve-noauth [port]` support).

## Follow-ups

None recorded.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
