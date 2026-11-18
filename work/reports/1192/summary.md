## TL;DR

Task #1192 was a third QA pass over the Android Hub app screens, covering theme switching, very long server/project names, and portrait/landscape rotation at phone sizes (360px and 412px). The engineer expanded the retained headless Playwright fixture script (`mobile/scripts/fixture-qa.ts`) to a 4-viewport rotation matrix × 8 themes × 3 appearances, plus long-name/URL checks at every viewport. The final run passed 302 of 302 checks and found **no reproducible product bug**, so no styling change shipped — the deliverable is the expanded test coverage and the QA record `docs/qa/2026-11-android-hub-third-pass.md`. Review passed on the first pass ("good to go") and the task landed normally.

## Outcome

- Expanded the Hub fixture QA sweep: viewports 360×800 and 412×915 portrait, 800×360 and 915×412 rotated; theme/appearance switching verified via document theme attributes, resolved appearance, CSS color-scheme and non-transparent background; long server name, overflow-menu visibility, long-URL edit sheet and add-form error cases at all four dimensions; existing fixture and lock-retry checks retained.
- Added `docs/qa/2026-11-android-hub-third-pass.md` (+51/−0) documenting browser, dimensions, assertions, results and the limits of the evidence (headless Chromium viewport simulation, not a real Android handset/WebView).
- Modified `mobile/scripts/fixture-qa.ts` (+128/−14).
- Final verdict: **done, release:success**; review pass 1 verdict "good to go". No product defect was found, so no app styling changed.

## Process stats

- **Rounds:** 1 engineering round, 1 review pass (verdict: good to go). No restarts or agent/model swaps.
- **Wall clock, created → done:** 2026-11-18T17:47:42Z → 2026-11-18T18:13:01Z = 25 min 19 s.
- **Engineer:** agent `engineer`, model gpt-6-luna, elapsed 744 s, 7,544,536 tokens, cost not recorded.
- **Reviewer:** agent `reviewer`, model gpt-6-luna, elapsed 25 s, 152,444 tokens, cost not recorded.
- **Routing sessions:** two, model "unknown" (Model router via openrouter), 0 s each, tokens not recorded.
- **Close-out gate:** completed in 674 s.
- Total tokens across recorded sessions: 7,697,  not stated; combined engineer + reviewer = 7,696,980.

## What went wrong

- **Watchdog escalation on a Playwright slot wait** (17:59:30Z): the engineer was queued at position 2 and the slot holder (pid 74680) had been dead for 14 s. The watchdog flagged "check wait escalated" and set needs_input; the wait ended 15 s later (17:59:45Z) and needs_input cleared automatically. No human action was required.
- **First Vite start failed to mount:** the initial `bunx vite --port 5188` in `mobile/` had resolved Vite from the root package before mobile dependencies were installed, so Capacitor imports failed and the lock-settings locator timed out. Fixed by `bun install --frozen-lockfile` in `mobile/`, stopping the first Vite process and restarting it; the original 55-check sweep then passed.
- **Test selector bug in the new harness (not an app bug):** the first expanded run requested lowercase appearance names with a case-sensitive exact role match, while the UI uses title case. Fixed with a case-insensitive exact regex.
- **Coverage gap caught mid-run:** the 295-check run's new long-name bounds assertion only covered its first viewport; the script was corrected to loop all four sizes, yielding the final 302-check pass.

No flaky checks, failed handoffs or gate failures were recorded. Shots were skipped as expected (diff touched no capture target's globs).

## Learnings

- Rotation coverage requires explicit wide-short viewport pairs (each portrait width with its rotated dimensions), not just "a phone width" — the matrix now encodes this.
- Long-name coverage must exercise each viewport directly; running the ordinary fixture across a matrix does not show how truncated user data behaves.
- Theme checks are more informative when they assert resolved document state (theme attribute, appearance, color scheme) and geometry after each control action, rather than confirming select options exist.
- Reuse over new harnesses: the #1171 QA script already had the right long-name/text-wrap checks; extending it kept one canonical Hub QA script.
- A headless Chromium viewport simulation cannot establish Android WebView, system bar, cutout, keyboard or live-server behavior — the QA doc records these boundaries explicitly.

These are recorded in the QA doc and the round report; they are Hub-QA-specific rather than repo-wide rules, so no AGENTS.md change is proposed.

## Follow-ups

None recorded. (The round report notes a human device QA pass would be needed to establish real Android WebView/system-bar/cutout/keyboard behavior, but no follow-up task was filed.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
