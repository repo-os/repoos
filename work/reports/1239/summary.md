## TL;DR

Task 1239 was a QA pass over sign-in, the OTP step, the user menu and the Settings → Security users/permissions screen at 375, 768 and 1280 px, using headless WebKit and fixture-driven auth responses only. Two engineering rounds found and fixed nine defects: a partial OTP submit on Enter, unreadable proxy errors reported as "Network error", lost focus when the user menu closed with Escape, native `<select>` and native `confirm()` calls on the users screen, silent load failures rendered as empty states, 22 px touch targets on phones, three more native `confirm()` calls on the same screen, and an unguarded Add-user submit. The browser QA test grew from 34 to 43 cases and passes; `docs/qa/2026-11-sign-in-users-qa.md` was committed. Review pass 2 returned `good to go`, and the task landed as `done` on 2026-11-19 at 19:59:26Z (merged commit `490aa926`). Real-device, real-email and real-expiry checks were deliberately not run and remain human-only work recorded in the QA note.

## Outcome

The task shipped what the acceptance criteria asked for:

- Fixes to the sign-in/OTP flow (submit guard on Enter and in-flight requests, proper parsing of server error bodies, focus return for the user-menu trigger).
- Fixes to the users/permissions screen (shared styled Select replacing the native `<select>`, shared teleported `ConfirmDialog` replacing native `confirm()` for remove, invite, Telegram unbind/disconnect/reassign, explicit "Couldn't load users" error states with Try-again for the users list, Telegram links and audit log, 44 px minimum touch targets below 760 px).
- A new 43-case headless browser QA test (`src/ui-app/tests/sign-in-users-qa-browser.test.ts`) covering wrong code, expired code, lockout and offline states at all three widths, passing at handoff.
- The required QA note, `docs/qa/2026-11-sign-in-users-qa.md`, including a "left as they are" section naming native controls that remain elsewhere in the UI so a future pass does not re-discover them.

Final verdict: review pass 1 was `needs some work` (three unfixed sibling instances of fixed classes in the same panel); review pass 2 was `good to go` and the task was closed out successfully (`release:success`).

## Process stats

- Wall-clock, created → done: 2026-11-19T18:27:10Z → 2026-11-19T19:59:26Z = 1h 32m 16s.
- Engineering rounds: 2, both by the `engineer` agent on Claude Code with model `haiku`. One engineer session is recorded: 89 tokens, cost $1.24988083, 121s elapsed. (The sessions table lists a single engineer row even though two rounds exist; per-round token/cost splits for round 2 are not recorded.)
- Review passes: 2, both by the `reviewer` agent on OpenCode with model `opencode-go/glm-5.3-flash`. Pass 1: 52,260 tokens, $0.02220027, 129s. Pass 2: 36,394 tokens, $0.01128691, 58s.
- Routing sessions: 2, model unknown, 0 tokens recorded.
- Restarts/swaps: no model swaps; the orphaned engineer process (pid 25575) was adopted twice (18:58:05Z, 19:04:10Z) after the task bounced from review back to active.
- Close-out gate: completed in 738s.
- Totals where known: tokens 89 + 52,260 + 36,394 = 88,743 (routing sessions excluded, model unknown); cost $1.24988083 + $0.02220027 + $0.01128691 = $1.28336801.

## What went wrong

- **`needs_input: needs-human-step` set at creation (18:27:11Z).** The flag came from the "never use or print real credentials" wording. The engineer read that as a constraint on the test (which uses no credentials) rather than a human step and did not clear the flag, reasoning it was RepoOS's metadata to manage. The genuinely human-only work (real devices, real email delivery, real expiry/lockout windows) is recorded in the QA note's "Not verified" section. The round-1 report suggested the task may need to be split; no split was recorded.
- **CTO nudge at 18:41:49Z** ("held — handoff gate is running") during the first handoff. Resolved normally; the first submission went to review at 18:55:27Z.
- **Review pass 1 found three unfixed siblings** of classes round 1 claimed fixed: three native `confirm()` calls in `AuthSettingsPanel.vue`, silent catches in `loadTelegramLinks`/`loadAudit`, and an unguarded `addUser` Enter path. Round 2 fixed all three; pass 2 verified them fixed at HEAD.
- **Stale review evidence in pass 2.** Both declared captures were taken for tree `2c6db7bea` (pre-round-2); HEAD was `042500dcc`. The reviewer's verdict was `good to go` as STALE-EVIDENCE-ONLY because the delta touched neither shot's declared content, with a suggestion to re-capture. The activity log shows no re-capture; the 19:19:15Z UI-verification note predates the round-2 fixes' capture state. The shots were not re-run on the final tree.
- **Vitest config trap.** Running the UI suites with bare `bunx vitest run` failed at collection (`SearchBar.vue` reported as invalid JS) because the Vue plugin was missing; the repo's `test:vitest` script with `--config src/ui-app/vite.config.ts` was needed. Resolved by using that config.
- **False test-failure from fixture design.** The first settings test answered unmocked routes with 404, producing a plausible-but-fake "Couldn't load settings" state. Fixed by passing unmocked requests through to the real fixture server.
- **Flaky parallel run.** Three tests in the offline-slow browser suite timed out once under the parallel run and passed 12 of 12 when run alone.
- **Mutation test without rebuild.** Round 2's first mutation attempt (guard removed to prove the double-Enter test can fail) skipped the UI rebuild and falsely passed; it was caught before any result was recorded, rebuilt, and the mutation then correctly failed the test.
- **Formatter reflow** caused an edit to the test file's `Reply` type to miss once; resolved by re-reading the file and retrying.

## Learnings

- **A state × viewport table finds edge defects faster than reading code.** The happy paths were already correct; every defect lived on an edge (Enter key, proxy error body, focus return, controls bypassing the design system). Worth folding into the QA conventions doc (`docs/agent-ui-and-preview-conventions.md`) as the recommended shape for a QA pass.
- **Browser-suite mutation tests must rebuild first.** The suite exercises the built `dist/`, so a source-only mutation tests the old code and proves nothing. This is a durable rule for anyone writing "prove the test can fail" evidence; it belongs in `docs/agent-ui-and-preview-conventions.md` or `docs/agent-debugging-and-incidents.md`.
- **Unmocked requests should pass through to the fixture server in Playwright-routed tests.** Answering everything with 404 fabricates app states that look like regressions.
- **Empty states and error states must come from different signals.** A `catch` block that sets nothing turns an offline user's failure into "No … yet." Setting an error ref in every catch fixes the whole class.
- **Radix-style Selects render an aria-hidden bubble `<select>`;** assertions about native selects must exclude `[aria-hidden="true"]` or they count the wrong element.
- **A "left as they are" list grounded in a repo-wide grep** (not a reviewer's memory) prevents the next pass from re-discovering known out-of-scope issues.

## Follow-ups

None — no linked tasks were recorded for this task. (Unfiled suggestions from the review worth picking up later: a follow-up task for the remaining native `confirm()`/`<select>` instances outside this diff — SettingsView, TelegramSettingsPanel, SystemResourcePanel, TaskDrawer, TaskCard, ServiceSettings, TunnelDrawer, DebugPanel — as the QA note itself recommends; and a decision on whether the `needs-human-step` split for real-device/real-email verification should be its own task.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
