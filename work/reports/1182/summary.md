## TL;DR

Task #1182 was a second QA pass over the Android Hub web UI at 360px and 412px, covering settings, add-server, edit-server, offline and lock flows that #1171's 375px baseline had not covered. No product layout defect was ever reproduced; what shipped is expanded QA coverage plus a real security fix found along the way: the lock fixture's forced-success query parameter could have bypassed device authentication in production, and fixture selection is now development-only with a production-preview regression test. The task took 3 engineering rounds (2 review rejections), passed review on round 3, and closed out successfully.

## Outcome

The task shipped three things:

1. **QA sweep expansion.** `mobile/scripts/fixture-qa.ts` now runs the seven supported fixture states (many, one, empty, unreachable, settings, add, discover) at 360px and 412px in addition to the prior 375px baseline, checking element bounds and clean console state, and exercising the Device lock settings control, the scope selector, the edit-server sheet with a long URL, and submission of an invalid HTTP URL.
2. **Lock-overlay interaction coverage.** A dedicated `lock` fixture drives the real `LockOverlay` through a failed verification (overlay stays), a retry that still fails, and a changed fixture result where retry succeeds and the overlay closes — at both widths. This closed the gap review found in round 1, where the sweep only checked the settings toggle and never reached the locked screen.
3. **Production fixture hardening.** Review pass 2 found that `?fixture=lock&auth=success` could force a successful "biometric" verification in a production build, bypassing device authentication. The fix gates all fixture selection (fake servers, forced lock settings, forced auth results) behind Vite development mode (`readHubFixture()` returns nothing outside dev; `import.meta.env.DEV` is statically replaced in production builds), with `readLockFixtureResult()` keeping a direct guard as defense in depth. A new `mobile/scripts/production-fixture-guard-qa.ts` opens the exact success-query URL against a production Vite preview and asserts the normal empty state renders with no fixture data and no lock overlay.

The committed record is `docs/qa/2026-11-android-hub-second-pass.md`, which documents setup, methods, results, fixture URLs, a reproduction command, and the explicit boundary that browser fixtures are not evidence for a physical Android device's native biometric prompt, WebView insets, or keyboard behavior.

**Final verdict: good to go** (review pass 3, 2026-11-18T10:07:17Z); the task moved to done with `release:success` and merged as commit `c3adf554c7ad6f9b0054958b3758be8633589626`. No CSS or product layout bug was reproduced at either width — the code changes are QA harness coverage and fixture isolation, not product UI fixes.

## Process stats

- **Engineering rounds:** 3 (rounds 1 and 2 sent back with "needs some work"; round 3 approved).
- **Review passes:** 3, same verdicts.
- **Wall-clock, created → done:** 2026-11-18T09:17:43Z → 2026-11-18T10:10:47Z, i.e. 53 minutes 4 seconds.
- **Agents and models (all roles):** a single engineer session (agent: `engineer`, model `gpt-6-luna`) covered all three rounds; all three reviewer passes used the `reviewer` agent with `gpt-6-luna`; routing was handled by the Model router (openrouter) with model "unknown". No agent restarts or model swaps are recorded.
- **Tokens:** engineer session 49,773,805; reviewer sessions 146,131 + 212,830 + 151,118 = 510,079 total. Routing sessions recorded no tokens.
- **Cost:** not recorded.
- **Session wall-clock:** engineer session elapsed 1317s (started 09:18:00Z); reviewer sessions elapsed 25s, 42s and 40s respectively.
- **Close-out gate:** completed in 80s.

## What went wrong

- **Engineer turn ended without a handoff (round 1).** At 09:27:32Z the engineer's turn exited cleanly (code 0) without requesting review; its stderr showed an `apply_patch` verification failure against the QA doc ("Failed to expected lines…"). The turn's own summary claimed the pass was complete with 47/47 checks. Resolution: the work was intact, and the handoff to review proceeded normally at 09:33:10Z.
- **Review pass 1 rejection (QA coverage gap).** The sweep enabled Device lock and asserted the scope selector appeared, but never exercised the lock screen or its failure/success flow — the task explicitly asked for the lock flow. Resolution: round 2 added the `lock` fixture with query-controlled auth results and drove the real overlay and Retry button at both widths (47 → 55 checks).
- **Review pass 2 rejection (security bug).** The new lock fixture could be selected in production: `?fixture=lock&auth=success` returned success without calling the native biometric plugin, so a production Hub session with those parameters could unlock without authentication. Resolution: round 3 moved the guard to the fixture-selection boundary (`readHubFixture()` dev-only), kept a second guard at the result helper, and added a production-preview regression test proving the exact success URL renders the normal empty state.
- **CTO nudge held.** At 09:39:51Z a CTO nudge was held because the handoff gate was running. It resolved itself; no action needed.
- **Local environment friction (round 1 only).** The first Vite start failed to resolve Capacitor imports until the mobile package's declared dependencies were installed with Bun. No dependency declarations or lockfiles were changed.
- **Flaky/order-dependent test assertion (round 1).** The settings check assumed the unsupported-device warning would show (Chromium reports the biometric plugin as supported) and clicked the toggle unconditionally, which could switch off a preference persisted by the previous width pass. Resolution: the script became state-aware — it reads `aria-checked`, toggles only when needed, and asserts visible controls and geometry instead of an environment-specific warning.

## Learnings

- **A settings toggle is not coverage for the screen it enables.** Review pass 1 is the case study: the lock flow was "checked" without the lock screen ever being shown. Security-related UI flows need to reach the resulting screen and cover both rejection and success paths. Worth carrying into the UI/preview conventions doc if not already implied there.
- **Security-sensitive fixture/query hooks must be gated at the selection boundary, not just where the value is consumed.** One guard at `readLockFixtureResult()` was not enough; `readHubFixture()` is now dev-only and a production-preview test proves the build-time `import.meta.env.DEV` replacement actually works. This is a durable pattern for any dev-only query parameter and belongs in a doc note or ADR if the mobile app grows more fixtures.
- **Persistent preferences make UI automation order-dependent.** Read the actual control state (`aria-checked`) before acting instead of assuming the initial state, especially in sweeps that run the same flow at multiple widths.
- **Browser capability shims are not device evidence.** Chromium reported the biometric plugin interface as supported, so asserting an "unsupported device" warning was wrong; and no browser fixture can prove native Android biometric prompts, WebView insets, or keyboard behavior. The committed QA doc keeps the browser-evidence vs device-evidence distinction explicit — that phrasing is the part worth reusing.
- **Cleaning up the exit-without-handoff failure mode** (a turn that exits 0 claiming success but whose patch application failed) may deserve a general note in `docs/agent-debugging-and-incidents.md` if it recurs; not durable enough yet to file on its own.

## Follow-ups

None.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
