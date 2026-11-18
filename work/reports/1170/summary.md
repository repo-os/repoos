## TL;DR

Task 1170 was a QA pass for mobile-width layout regressions at 375px and 768px across Work, Releases, Settings, Agents and Checks. It shipped three CSS fixes in `src/ui-app/src/style.css` (Settings tab-strip clipping, the 60px-rail's theme-switcher/build-widget spilling past the rail edge, and the Work parked-toggle dock overlapping the board and integration pill), a 15-case WebKit regression test file, a committed measurement script and a QA findings doc. It took 6 engineering rounds and 6 review passes — 5 returned "needs some work", mostly chasing breakpoint-band boundaries one width at a time — before pass 6 returned "good to go" (with an evidence-gap note). It landed with release success at 2026-11-18T06:34:01Z.

## Outcome

What shipped, per the round reports and change summaries:

- **Settings tab strip:** the horizontal-scroller rule previously stopped at 760px, so the seven tabs (≈695px natural width) clipped their last tab in the 761–815px band. The scroller breakpoint was extended (ultimately to 1000px) to cover the whole rail band.
- **Rail hide fix:** `.theme-switch` and `.build-widget` were hidden by a single-class `display:none` that lost to later base rules of equal specificity; the hide is now scoped to `.sidebar`.
- **Work parked-toggle dock:** the fixed toggle row (which reserved 520px for the centred integration pill) overlapped the Active column and parked chips in the 761–1140px band. The dock is now lifted above the pill across 761–1140px, with the band edge derived from the measured 378px chip-row requirement rather than a round number, and stays out of the fixed flow below 761px to preserve phone-reflow Work.
- **Tests:** `src/ui-app/tests/tablet-rail-layout-browser.test.ts` with 15 cases (dock coverage at 768, 900, 1000, 1101, 1120, 1140px; a 740px in-flow case; Settings strip cases), verified to fail against the original CSS.
- **Docs:** `docs/qa/2026-11-web-mobile-widths.md` (findings, evidence limits, open risks) and the committed measurement script `docs/qa/measure-mobile-widths.mjs`.

Final verdict: review pass 6 returned **good to go**, marked EVIDENCE-GAP-ONLY because the four declared 375px/768px Work/Settings captures never materialised in handoff evidence (the only capture was the desktop dashboard). Status: done; merged commit `621432ee6456197e5367e70e5f4c408f1ff4ec14`; release:success.

Documented, not fixed (open risks in the QA doc): an expanded integration pill can still reach the dock toggles (the test renders only the idle pill); the Settings strip has only ~4px slack at 961–1000px with the Sora font; the dock/pill overlap from 1141px to ~1384px (measured in review pass 3) is outside the task's documented band; floating avatars covering Settings theme stars is left as a product decision.

## Process stats

- **Wall-clock, start to done:** 2026-11-18T02:19:49Z → 2026-11-18T06:34:01Z = 4h 14m 12s.
- **Engineering rounds:** 6 (agents "claude code", model haiku per rounds 1–3; the session table records two engineer sessions, both started 2026-11-18T02:20:41.966Z — haiku, 2592s elapsed, 37,560 tokens, $3.30103646; and gpt-6-luna, 1404s elapsed, 21,086,508 tokens, cost not recorded). No engineer swap is separately recorded; agent/model attributions for rounds 4–6 are not recorded in the rounds list.
- **Review passes:** 6 — passes 1–3 by reviewer agent "opencode" on `opencode-go/deepseek-v4.1-flash`, passes 4–6 by "codex" on `gpt-6-luna`; the swap was recorded at 03:40:32Z via cli_override/model_override. Verdicts: passes 1–5 "needs some work", pass 6 "good to go". Reviewer session stats: 447s/73,279 tokens ($0.028076334), 357s/90,116 tokens ($0.03718629), 531s/117,066 tokens ($0.05188545), then 60s/201,151, 35s/259,864 and 31s/160,945 tokens (costs not recorded for the gpt-6-luna sessions). Recorded reviewer cost total: $0.117148074; combined recorded reviewer tokens: 902,421.
- **Routing sessions:** 6 "Model router (openrouter)", model unknown, 0–3s each.
- **Close-out gate:** completed in 914s (15m 14s).

## What went wrong

- **Boundary-chasing fixes.** Every review pass 1–3 found the same bug class one width further out: the dock lift moved to 720px and broke the 720–760px phone-reflow band (pass 1); extended to 1100px and the chips wrapped again at 1101–1133px (pass 2); extended to 1140px and the centred pill covered the last toggle from 1141px (pass 3, left as out-of-scope). Each was resolved by extending the band and adding the boundary width to the test's `it.each`.
- **A fixture that couldn't see the bug.** The first regression test's Settings-strip fixture measured ~40px narrower than the live app, so its overflow assertion passed on the broken CSS. Resolved by asserting the scroller rule instead and documenting the trade-off.
- **Background server launch died** during the UI build in round 1; resolved by running `bun run build` in the foreground and starting the serve command directly.
- **Watchdog restart** at 03:24:15Z ("a queued message waited 3m with no live process"), plus a queued message still undelivered after 60m flagged at 04:41:04Z, and a turn ended without a handoff at 05:28:15Z so a queued message could be delivered (its stderr recorded a `write_stdin failed: Unknown process id` error).
- **Handoff failures and deferrals:** deferred at 05:19:37Z (queued messages unread); failed at 05:37:55Z because the engineering report draft `.repoos/engineering-report-drafts/1170.md` was missing even though the code was ready.
- **Shots trouble:** capture cancelled at 05:14:45Z; automatic capture skipped at 05:33:27Z (an engineer-made capture pre-empted it); the `.work-page` highlight matched nothing at 05:22:01Z. Passes 4–6 all flagged that the declared Work/Settings mobile captures were missing from handoff evidence.
- **Review-rounds-exhausted needs_input** twice (03:41:21Z and 05:14:45Z); the human (hello@repoos.org) cleared it for further review at 04:16:13Z and 05:49:42Z.
- **Evidence limits:** Settings and Releases content stayed on loading skeletons in the auth-less session (API 401s), so those panels were verified by reading CSS, not rendered content; real devices and touch were unavailable, so the pass covers layout geometry only.

## Learnings

- **Check both ends of every breakpoint change.** Each fix was correct for the width being fixed and wrong at the first width past the new boundary. The review's prescription — add the first width past the boundary to the test — is the durable form of this lesson. Worth a line in `docs/agent-ui-and-preview-conventions.md`.
- **Derive band edges from measured content width, not round numbers.** The 1140px dock edge comes from the measured 378px chip row plus sidebar and gutter, and the CSS comment states that reasoning so a future edit can re-check it. Worth a line in `docs/agent-ui-and-preview-conventions.md`.
- **Scoped hides beat single-class hides:** a single-class `display:none` in a media query loses to a later base rule of equal specificity; scope the hide to its container.
- **WebKit geometry tests catch what jsdom can't**, but a fixture is only as good as its metrics — where the fixture can't reproduce live metrics, assert the rule that guarantees the behaviour and say so in the test.
- **Write the engineering report draft before requesting handoff** — a missing draft blocked handoff on ready code. This is a handoff-prep checklist item; belongs in `docs/agent-workflow-rules.md` if not already there.
- **Declare shots that actually show the changed surfaces** with highlights that match real selectors (`.work-page` matched nothing); otherwise the review records the verdict as EVIDENCE-GAP-ONLY even on a clean code pass. Reinforces the existing `## Shots` conventions in `docs/agent-ui-and-preview-conventions.md`.
- **Reviewers recurring on one bug class is a signal**: pass 6 explicitly asked that a human review the recurring breakpoint-boundary pattern.

## Follow-ups

None recorded. (Open risks documented in the QA doc — expanded integration pill vs. dock toggles, the ~4px Settings-strip slack at 961–1000px, the 1141–~1384px dock/pill overlap outside the fixed band, and the floating-avatar default placement product decision — were not filed as tasks per the linked-tasks record; they live in `docs/qa/2026-11-web-mobile-widths.md`.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
