## TL;DR

Task 1219 shipped a responsive long-data QA pass for the Checks and Releases pages: a headless WebKit regression test that mounts the real `ChecksView` and `ReleasesView` with 24-row long-token fixtures at 375, 768 and 1280 px, plus small CSS fixes for long check names, command snippets and release metadata. The QA evidence note `docs/qa/2026-11-checks-releases-data-qa.md` was committed as required. The first review rejected the initial synthetic-DOM fixture; the engineer reworked it onto the real components, and the second review passed with "good to go". The task closed as done (merged commit `a6f19eba60d81cf76325fca1d5fc39ebdc791d9e`) after one mid-task engineer crash and model swap.

## Outcome

Both pages now survive list-heavy, long-token data at all three target widths:

- New test `src/ui-app/tests/checks-releases-data-responsive.test.ts`: renders the actual Vue pages with fixtures of 24 check steps and 24 release channel records with long identifiers, package references and URLs; asserts all rows stay in the DOM, page scroll width never exceeds the viewport, the channel action stays on-screen, and long step titles wrap. It also verifies manual "Check again" bypasses the pinned fixture and calls the live API.
- CSS hardening in `ChecksView.vue` and `ReleasesView.vue`: `min-width: 0` + `overflow-wrap: anywhere` on check step titles, a max-width bounded horizontally-scrollable command block, and safe wrapping for release provider metadata and distribution descriptions extended beyond the narrow-screen media query.
- `docs/qa/2026-11-checks-releases-data-qa.md` documents the fixture, checks performed, code adjustments and the limits of synthetic layout evidence.

Final verdict: review pass 2 recorded "good to go"; the task moved to done and the release succeeded.

## Process stats

- **Created → done:** 2026-11-19T06:17:33Z → 2026-11-19T07:54:41Z, i.e. 1 h 37 m 08 s wall clock.
- **Dev rounds:** one recorded engineering round, containing two handoff cycles (active→review at 06:32 and again at 07:29 after the review rework).
- **Review passes:** 2 — pass 1 "needs some work" (06:32:55Z), pass 2 "good to go" (07:33:27Z).
- **Engineer:** started as `codex` with `gpt-6-luna` (session 2794 s, 14,846,188 tokens, ended errored); after crash recovery swapped to `opencode` with `opencode-go/deepseek-v4.1-flash` (session 3977 s, 14,959,371 tokens, cost $0.057083664). One restart/swap total.
- **Reviewer:** pass 1 by `codex`/`gpt-6-luna` (39 s, 273,226 tokens, cost not recorded); pass 2 by `opencode`/`opencode-go/glm-5.3-flash` (213 s, 53,411 tokens, cost $0.02448675).
- **Tokens (engineer + reviewer, both sessions each):** 29,805,559 total.
- **Cost (where recorded):** $0.081570414 across the deepseek-v4.1-flash engineer session and the glm-5.3-flash reviewer session; the two gpt-6-luna sessions' costs are not recorded.
- **Close-out gate:** completed in 492 s.

## What went wrong

- **Synthetic fixture rejected in review (pass 1).** The first implementation copied page CSS into hand-built markup instead of exercising the real components, so the responsive acceptance criteria were arguably unverified even when tests passed. Resolution: engineer rebuilt the test to mount the real `ChecksView`/`ReleasesView` through a Vite harness with only the repo store stubbed, and re-declared shots with the long-data fixture states. Pass 2 confirmed fresh captures at the reviewed HEAD showed the declared fixture states with no visual defect.
- **Engineer crash (07:09:54Z).** The codex engineer errored out with `failed to record rollout items: thread … not found`. Crash recovery fired after 1 of 3 allowed crashes in 30 m and swapped the agent/model pair to `opencode` + `opencode-go/deepseek-v4.1-flash`. The task briefly went to `needs_input` (07:09:57Z); the new engineer resumed on the same worktree and completed the rework.
- **CTO-nudge holds (normal coordination, not failures).** While remote validation and the handoff gate were running, completion nudges were held (06:32:59Z, 06:55:29Z); a reminder after 5 minutes without worktree activity was held at 07:08:11Z because an undelivered message was already queued.
- **Shots initially didn't show the claimed data.** The first handoff captures (06:32) matched their routes but showed ordinary data, not the long fixtures the QA note described. Fixed by aligning the capture states with the new fixture; re-captured at 07:31:25Z on the reviewed tree and verified by pass 2. Both UI verifications (06:32 and 07:45) recorded clean consoles.

## Learnings

- **Test the real page, not a replica.** Copying page CSS into synthetic markup can pass while the actual component overflows. The repo convention should be: responsive regression tests mount the real views with a stubbed store. Worth a line in `docs/agent-ui-and-preview-conventions.md` if not already there.
- **Nested flex children need explicit `min-width: 0`** and safe word-breaking on human-readable identifiers; a single long token inside a flex child can widen the whole page even when the shell fits. For command text, prefer a bounded horizontally-scrollable code block over wrapping, preserving command fidelity.
- **Handoff shots must show what the QA note claims.** A route matching with ordinary data is not evidence for a long-data scenario; declared `state` fixtures should match the regression fixtures. This mirrors the existing shots guidance and is worth reinforcing in `docs/agent-ui-and-preview-conventions.md`.
- **Codex rollout-thread crash is recoverable by the standard crash-recovery swap** (agent + model pair change); the 1-crash-in-30 m trigger worked as designed. If this codex error recurs, it belongs in `docs/agent-debugging-and-incidents.md`.

## Follow-ups

none

<!-- repoos:generated-changes -->
## Changed files

- M docs/qa/2026-11-checks-releases-data-qa.md: +7 / −3
- M src/core/shot-fixtures.ts: +6 / −0
- M src/ui-app/src/lib/shot-preview-fixtures.ts: +71 / −0
- M src/ui-app/src/views/ChecksView.vue: +11 / −0
- M src/ui-app/src/views/ReleasesView.vue: +25 / −0
- M src/ui-app/tests/checks-releases-data-responsive.test.ts: +126 / −15
- M src/ui-app/tests/fixtures/checks-releases-responsive.ts: +10 / −2
- M src/ui-app/tests/shot-preview-fixtures.test.ts: +26 / −0
