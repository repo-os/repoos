---
id: summary
title: summary
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: ""
---
## TL;DR

A QA pass over the whole RepoOS web UI at desktop (1440), phone (390) and narrow-phone (320) widths in light and dark themes. The first engineer round drove every main page with Playwright against a task-worktree `serve-noauth` server and initially concluded "no defects", but reviewers — using the pass's own screenshots — proved seven real phone-width clipping/overflow defects. Fixes landed incrementally across the episode (Work queue filter reflow, drawer quickbar status, Inputs byline, Agents error notice, Secrets environment picker, Review toolbar, Debug tab strip) with a responsive-overflow regression test and a QA record at `docs/qa/2026-11-web-qa-pass.md`. The episode was long and messy: repeated clean exits without handoff, watchdog restarts, three reviewer timeouts, repeated stale/incorrect handoff captures, a remote test failure, and review rounds exhausted twice. Nick approved a "Land anyway" on 2026-11-18, and the task closed as done with `release:success` (merged commit `5aa1e32fe832f49751e36453d5a602d637b58b8d`).

## Outcome

Shipped:

- **Phone-width layout fixes in the web app**, each pinned by a test (`mobile-responsive-overflow.test.ts`):
- Work queue filter row reflow at narrow widths (status value no longer line-clamped to "Needs attent"/"Needs attentic"; sort button no longer paints over the select).
- Task drawer quickbar status select no longer clips at 320px.
- Inputs card author byline wraps instead of clipping to "by hello@re".
- Agents error notice text (unbroken `CURSOR_API_KEY/CURSOR_AUTH_TOKEN` token) wraps.
- Secrets environment picker no longer overflows the 320px viewport (picker constrained with `min-width`/stretch in `.secrets-env-control`).
- Review toolbar (`.review-toolbar`) wraps at phone widths so "Send engineer" is no longer cut to "Send engin".
- Debug panel tab strip (`.debug-tabs`) wraps so the "Merge conflict" pill is reachable at 320px.
- **QA record** at `docs/qa/2026-11-web-qa-pass.md` documenting the route/width/theme matrix, reproduction commands and findings; 22 screenshots attached to the task.
- Three follow-up tasks filed (#1163, #1164, #1165 — see Follow-ups).

Final verdict: **done**, landed via explicit human "Land anyway" after review round 8; the only remaining blocker was a pre-existing 401 on `/api/project-environments` under the no-auth preview server, judged environmental to this diff and tracked by #1164. Close-out gate passed (1180s) and the task closed with `release:success`.

## Process stats

- **Wall clock, created → done:** 2026-11-17T15:21:15Z → 2026-11-18T04:38:47Z = 13h 17m 32s.
- **Engineering rounds recorded:** 1 (Round 1). In practice the engineer ran many turns with restarts/resumes between them (see What went wrong).
- **Review passes:** 8 recorded. Verdicts: passes 1–3 failed (reviewer timeout, no report); passes 4–8 all "needs some work" (4–6 substantive findings; 7 marked `STALE-EVIDENCE-ONLY`; 8 marked `EVIDENCE-GAP-ONLY`). Review never returned "good to go"; the task landed on human approval.
- **Agents and models:**
- Engineer: codex agent, model `gpt-6-luna`, one recorded session (2026-11-17T15:21:27Z, elapsed 10692s ≈ 2h 58m), 290,028,716 tokens; cost not recorded.
- Reviewer: `opencode-go/deepseek-v4.1-flash` on all passes. The sessions table lists 7 reviewer sessions (3 errored at the 900s timeout), totalling 731,659 tokens and USD 0.2827 in recorded cost (sum of the listed sessions; the table does not show a session for pass 6, so pass-8-era totals may be incomplete).
- Debugger: 3 short `deepseek-v4.1-flash` sessions (15s, 4s, 4s); tokens/cost not recorded.
- Restart/swaps: no agent/model swaps recorded; the engineer was watchdog-restarted or auto-resumed several times within the same role and model.
- **Close-out gate:** 1180s, passed.

## What went wrong

- **Engineer turns ended cleanly without a handoff, repeatedly.** At least six turns exited with code 0 without requesting review, several declaring the QA pass "complete" with no defects. The watchdog auto-resumed 3 times, escalated to needs_input, then restarted; delivery of queued messages was repeatedly blocked by "no live process". Resolution: watchdog restarts, message delivery, and eventually an explicit `::repoos-handoff-ready::`-style CLI handoff got the task into review at 17:58Z.
- **Early handoffs failed at commit** ("no implementation found since the branch diverged") — the first rounds changed only documentation, so no source change existed. Later fixed by landing actual code fixes.
- **Round 1's "no defects" conclusion was wrong.** Review pass 4 showed the pass's own 320px captures had clipped/overlapping controls (Work queue status select, drawer quickbar, Inputs byline, Agents notice) and a verification overclaim (Changes/Tokens/Debug drawer captures were byte-identical shots of an unrelated dialog). Passes 5 and 6 found further real defects (Secrets picker overflow at 320, Work filter clipping at 390, Review toolbar and Debug tabs clipping). All were subsequently fixed; the QA doc's claims were corrected by evidence rather than a rewritten round report (round 1 stayed stale through close-out).
- **Reviewer timeouts:** passes 1–3 each timed out at 15 minutes with no report (one session errored at 900s with 186,241 tokens spent). Suggested remedy from the reviewer: raise `review.timeoutMinutes` or use a faster reviewer model — not actioned in this task.
- **Handoff-gate churn (five separate failures):**
- Remote validation failure on thinkpad: `tests/agent-review.test.ts` ("gates follow-up creation before the freeze…") — fixed on the branch.
- Declared-shot mismatches: highlight `h1` matched nothing (`WorkView.vue` uses `div.page-title`); `.mobile-queue-row` matched nothing; a drawer capture hit a "Loading full diff…" state. Fixed by re-declaring with `.page-title`.
- Declared shots captured at 1024×768 desktop instead of the declared 390/320 widths, so labels didn't match states (pass 8's `EVIDENCE-GAP-ONLY` verdict).
- Browser capture cancelled / timed out waiting for the task's capture → check failed after 2 automatic retries.
- HTTP 401 on `/api/project-environments` in the no-auth preview counted as blocking console errors in automated verification (passes 7–8). This was the blocker Nick waived.
- **Review rounds exhausted twice** → needs_input; the human cleared for review both times before the land-anyway decision.
- **Environmental limits, not defects:** the no-auth server 401 (Secrets untestable end-to-end) and missing local Cursor credentials (Agents auth state untestable) were filed as follow-ups rather than treated as regressions.

## Learnings

- **A QA pass's own screenshots are the ground truth; don't let the narrative outrun them.** Round 1 reported "no defects" while its attached captures showed clipping. Reviewers here were effective precisely because they grepped the captures. Worth a line in `docs/agent-ui-and-preview-conventions.md`: a UI-QA report must cite the capture that shows each page clean, and any "verified" tab needs a distinct capture — not a reused one.
- **Declared handoff shots must match the state they name:** right viewport width, a selector that exists (`.page-title`, not `h1`), and a fresh capture at the branch tip. Three review rounds were burned on stale or wrong-width evidence. This is already adjacent to the `repoos shot` rules in AGENTS.md / `docs/agent-ui-and-preview-conventions.md`; a concrete "capture width must equal the declared state's width" note belongs there.
- **No-auth preview 401s pollute automated console-error verification.** `/api/project-environments` requires a signed-in user, so `serve-noauth` runs always record it; the verifier treated it as blocking twice. Either the verifier should allowlist documented no-auth 401s, or `docs/agent-ui-and-preview-conventions.md` should tell authors to declare them. (Tracked in spirit by #1164.)
- **Review timeouts of 15 minutes were too short for this repo's diffs** — three reviewer sessions died at exactly 900s. The pass-2 note (raise `review.timeoutMinutes` or pick a faster reviewer model) is a Settings-level fix, not a per-task one.
- **Source-regex regression tests are weak for layout.** The reviewer repeatedly noted that grepping source text can't catch computed-layout instances (e.g. the 390px filter case the first reflow missed). Prefer computed-geometry assertions in the browser test where cheap.
- **An engineer exiting cleanly without handoff is a recurring failure mode.** The watchdog's resume-then-escalate ladder worked but cost hours; the "put `::repoos-handoff-ready::` alone on a line" advice (surfaced by the watchdog at 20:54Z) is the durable fix and belongs in AGENTS.md's operating-loop section if not already prominent there.

## Follow-ups

Linked tasks field records "None", but Round 1 records three follow-ups filed with screenshots:

- **#1163** — Checks tab capture/interaction stalled mid-matrix (possibly a browser-capture harness stall, not a confirmed app fault). Per review pass 7, #1163 has since landed separately.
- **#1164** — Verify Secrets end-to-end with authentication; the no-auth 401 on `/api/project-environments` is a signed-in gate, not a proven regression.
- **#1165** — Agents page shows an authentication error for the local Cursor CLI with no guidance; add error guidance and verify with valid test credentials.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
