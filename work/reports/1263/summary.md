## TL;DR

Task #1263 swept the Settings General tab and the Agents page's Budget Controls tab headlessly (Playwright/WebKit only) at 375, 768 and 1280 px and fixed what it found. No layout overflow or page errors existed; the real defects were accessibility and discoverability: setting controls had no accessible name (labels were plain `div`s), and the Agents sub-tab strip clipped its last tab ("Model routing") at 1280 px because it hid its scrollbar and didn't wrap. Three engineering rounds added `aria-label`s across the whole class of unnamed controls, made `.agent-tabs` wrap at every width, and added a permanent browser QA probe covering 14 Settings/Agents routes at three widths. After 5 review passes (2× needs some work, a stale-evidence pass, an evidence-gap pass, then good to go), the task closed as done with `release:success`, merged as `f31d5a34316eb1f72eb0a5051816d26dd4fc3d33`.

## Outcome

Shipped:

- **Accessible names on all setting controls.** Every config-driven row in `SettingsView.vue` and every hand-written switch/input/select across `ServiceSettings.vue`, `SettingsImportExport.vue`, `TelegramSettingsPanel.vue`, `AuthSettingsPanel.vue`, `AgentCard.vue`, `BuiltInAgentCard.vue`, `ScheduledTasksPanel.vue`, `RemoteValidationDrawer.vue` and `AgentsView.vue` now carries an `aria-label` (or wrapping label), because the visible `div` label was never programmatically linked to its control.
- **Tab strip wraps at all widths.** `.agent-tabs` in `style.css` changed from `flex-wrap: nowrap` + hidden-scrollbar `overflow-x: auto` (wrap only below 900 px) to `flex-wrap: wrap` with no `overflow-x`, so "Model routing" and the other trailing tabs are reachable at 1280 px, matching the fix #1139 applied to phones. `ChecksView.vue` uses the same class and wraps too.
- **A durable QA probe**: `src/ui-app/tests/settings-agents-budget-qa-browser.test.ts`, walking all five Settings tabs plus the Agents tabs (14 routes) at 375/768/1280, checking overflow, accessible names (counting image alt, label wrappers and `labels`) and focus change, with a guard that a focus audit reaching zero controls cannot pass silently.
- **Updated contract test**: `mobile-touch-affordances.test.ts` now asserts the base `.agent-tabs` rule wraps and that no `overflow-x: auto` remains — a deliberate, declared contract change, not test weakening.

Final verdict: review pass 5 returned **good to go**; the task is **done** with `release:success`. Loading/empty/error states and save-time validation messages were out of scope for this pass (existing tests cover some of them); focus-ring contrast was not measured.

## Process stats

- **Wall-clock, created → done:** 12 h 7 m 54 s (2026-11-20T02:27:07Z → 2026-11-20T14:35:01Z).
- **Engineering rounds:** 3 (03:05:57Z, 03:36:06Z, 07:24:59Z).
- **Review passes:** 5 — pass 1 needs some work, pass 2 needs some work, pass 3 good to go (stale-evidence-only), pass 4 needs some work (evidence-gap-only), pass 5 good to go.
- **Engineer:** 1 session, agent `claude code`, model `haiku`, elapsed 6311 s, 27,608 tokens, cost $11.279149749999998. No model swaps recorded.
- **Reviewer:** 5 sessions, agent `reviewer`, model `opencode-go/glm-5.3-flash`, elapsed 167 + 128 + 116 + 111 + 99 = 621 s; tokens 45767 + 48167 + 49714 + 47808 + 48284 = 239,740; cost 0.02167362 + 0.0210517 + 0.02138096 + 0.01678024 + 0.0195893 = $0.10047582.
- **Debugger:** 1 session (2026-11-20T06:44:29Z), model `opencode-go/deepseek-v4.1-flash`, elapsed 12 s; tokens and cost not recorded.
- **Routing:** 5 sessions ("Model router (jev)"), model unknown, 0 s elapsed; tokens and cost not recorded.
- **Total recorded tokens:** 267,348; **total recorded cost:** $11.37962557. Debugger and routing sessions contribute no recorded figures.
- **Restarts/swaps:** no agent restarts or model swaps recorded; three engineer turns ended early (see below).

## What went wrong

- **Scoped check failed on `worktree-drift` (round 1).** The engineer reverted an unused harness method while the check ran, so a tracked file changed mid-run. Re-ran with the tree left alone; every step passed.
- **Build failure from a malformed attribute (round 2).** A generated `:aria-label=""X""` (doubled quote) broke the UI build; caught before any test ran and repaired.
- **Headless WebKit keyboard focus is unreliable.** A real Tab-key walk sometimes saw zero controls because a fresh page didn't hold keyboard focus; `bringToFront()` retries didn't fix it. Replaced with an in-page focus audit (focus each control in DOM order, compare focused vs resting look) plus a non-zero-visited guard. This is a probe limitation, not an app fix — a human keyboard check on focus-ring contrast remains unmeasured.
- **Incomplete class coverage caught twice by review.** Pass 1 found sibling unnamed controls (Advanced/Notifications/Security tabs, ServiceSettings, SettingsImportExport); pass 2 found the same pattern on the Agents page cards, Scheduled Tasks and the Remote Validation drawer. Each round extended the `aria-label`s and widened the probe so the class is enforced, not just fixed once.
- **Handoff failed twice.** At 04:13:43Z, UI verification failed: both declared shots caught the loading state (`[aria-busy="true"]`) instead of rendered controls. At 04:29:40Z, remote validation failed on `Agents → Model routing at 1280px` — the selected tab was scrolled out of its non-wrapping strip. Both were fixed in round 3 (CSS wrap + updated pinned-CSS assertion). Loading-state captures persisted into pass 4 (stale tree `e935ce52d`-predecessor captures showing skeletons); they were re-captured, and pass 5 confirmed both captures current on tree `e935ce52d` with zero console errors.
- **Queued-message stalls.** A queued message went undelivered past 60 m twice (`message_overdue` at 05:42:27Z and 08:27:31Z). Three engineer turns were ended to flush queued messages (exit code 143, at 03:55:20Z, 04:00:51Z and 07:10:48Z); the status cycled review→active at 06:46:30Z to deliver one. Several CTO nudges were held because a message was already queued or the handoff gate was running. An orphaned run process (pid 61702, bun, worktree `feat/qa-pass-settings-…`) was stopped at 04:13:57Z. One queued message was finally dropped at 14:34:14Z as the task closed.
- **Misleading failure wording.** The queued gate-failure message said "visible focus on bee"; the actual test failure was a clipped tab, not focus. Running the failing test alone resolved it in one step.

## Learnings

- **A visible label is not an accessible name.** Rows pairing a plain `div` label with a control need an explicit name on the control; `aria-label` from the same source string is the cheapest fix. Worth a line in `docs/agent-ui-and-preview-conventions.md` so future UI work names controls at creation.
- **Measure focus at rest.** A `transition-colors` change makes a focus state look unchanged for ~150 ms; probes must disable transitions before reading styles.
- **An audit that reaches nothing passes silently.** Always guard automated walks with a minimum-visited assertion.
- **A hidden scrollbar on a horizontally scrolling tab strip is a clipping bug**, not a style choice — wrapping is safer than scrolling for a short fixed set of destinations (extend the #1139 rule to all widths; candidate for `docs/agent-ui-and-preview-conventions.md`).
- **A CSS fix can break a test that pins the old CSS.** Update the assertion to the new contract and declare the change in the round report rather than re-adding dead rules.
- **Rebuild the UI before every probe run** — browser tests run against the built bundle, and a stale bundle reports old failures.
- **Vue-based suites must run under `src/ui-app/vite.config.ts`** (`--config`), not the root Vitest config, or they fail to load with a plugin error.
- **Run the failing test alone and trust its output over a paraphrased message** — the queued message's wording sent attention to the wrong subsystem.

## Follow-ups

None recorded.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
