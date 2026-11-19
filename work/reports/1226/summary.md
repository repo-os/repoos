## TL;DR

Task #1226 was a QA pass over slow, failing and dropped network connections in the RepoOS web app and Hub. Using headless Playwright request interception only, it found and fixed three real defects — an unbounded auth check that could freeze the whole app behind an endless skeleton, an offline banner that outlived a page that had already recovered on its own, and an endless skeleton in Settings when config loading failed — with unit tests, a new 9-test browser matrix, a QA doc and two declared shots. One review pass found a gap in the banner-retraction invariant, which was fixed; the second review passed. The task landed as `done` with `release:success` on 2026-11-19. The session itself was rocky: agent fallback after a provider quota pause, repeated orphaned processes and watchdog recovery failures, a report-formatting finalization error, and one load-dependent contrast-audit flake.

## Outcome

The web app's four main surfaces (Work board, task drawer, Agents, Settings) were exercised under three failure modes — dead server, HTTP 500 responses, and responses that stall past the client's own timeouts — at 375, 768 and 1280 px, using headless WebKit with Playwright route interception against fixtures. Three defects shipped fixed:

1. **Stalled auth check froze the app.** `/api/auth/me` had no timeout and gated both the router guard and `App.vue`'s `onMounted`, so a server that accepted connections but never answered left every page spinning forever. It is now bounded at 6 s with an `AbortController`; a timeout is treated like any other auth failure and the app renders normally.
2. **The offline banner contradicted a recovered page.** The board already recovered itself via SSE reconnect with jittered backoff, but the "…is not running" banner only cleared on focus/navigation. `clearOfflineOnStreamBack()` now clears the banner the moment the stream is demonstrably back (safe no-ops for stale banners and in-flight manual reloads preserved).
3. **Settings showed an endless skeleton when `/api/config` failed.** It now shows "Couldn't load settings" with a Retry button, using a shared `.page-load-error` class generalized from Agents' panel so both surfaces present the same recoverable pattern.

Supporting work: a new `offline-slow-network-browser.test.ts` (9 headless tests covering the full failure-mode × surface × width matrix plus self-recovery and overflow checks), unit tests (`auth-stall.test.ts`, `settings-load-error.test.ts`, `ui-recovery.test.ts` additions), two capture-only shot fixtures (`settings:loadFailed`, `agents:loadFailed`), harness route-type extensions (`abort`/`fetch`+`fulfill`/`unroute`), and `docs/qa/2026-11-offline-slow-network-qa.md`.

**Deliberately out of scope, documented in the QA doc:** the Hub loads the same SPA in its WebView so page behavior applies there, but the native Capacitor shell's own loading/return-to-picker screens were not driven (needs a real device). LoginView's own unbounded fetches were also declared out of scope and filed as a follow-up.

**Final verdict:** review pass 2 returned `good to go`; the branch merged as commit `483d054c2b90d905ecbe1897b55edf6f8230ba78` and the task closed as `done` with `release:success`.

## Process stats

- **Calendar:** created 2026-11-19T09:47:34Z, done 2026-11-19T16:24:08Z — 6 h 36 m 34 s wall-clock from start to done (derived from those two recorded timestamps).
- **Engineering rounds:** 1 recorded engineering round (2026-11-19T15:25:21Z), built on WIP checkpoint commits left by earlier engineer runs that never handed off.
- **Review rounds:** 2. Pass 1 (15:28:18Z) — `needs some work`, one banner-retraction gap. Pass 2 (16:13:33Z) — `good to go`.
- **Agents and models:**
  - Engineer: `opencode` + `opencode-go/glm-5.3-flash` — used throughout as the fallback because the primary `codex` + `gpt-6-luna` was paused out of usage since 2026-11-19T07:09:32Z (noted repeatedly in the log). Recorded session: 318,327 tokens, $0.05647497, 657 s.
  - Reviewer: `opencode-go/glm-5.3-flash`. Pass 1: 65,733 tokens, $0.03775074, 175 s. Pass 2: 46,075 tokens, $0.01355427, 74 s.
  - Debugger: one `opencode-go/deepseek-v4.1-flash` session at 09:51:25Z, 5 s; tokens/cost not recorded.
  - Routing sessions (11 × Model router, `jev`): model, tokens and cost not recorded.
  - Recorded totals (engineer + both reviewers): 430,135 tokens, $0.10777998. Debugger, routing and any unrecorded sessions are not included.
- **Restarts and swaps:** 3 engineer crash-recovery events (09:51:25Z, 14:04:52Z, 15:49:36Z, each "1/3 crashes in 30m"); 3 watchdog auto-resumes (10:00:44Z, 12:54:47Z, 14:15:26Z) plus one more after the finalization error (15:56:58Z); 5 watchdog restarts after no live process (10:10:59Z, 10:28:29Z, 10:38:44Z, 14:52:11Z, 15:10:57Z); 3 orphaned engineer processes stopped (pids 94488, 89979, 42969); 5 orphaned run processes stopped (pids 39755, 3992, 13797, 86654, 59293); 1 engineer stopped by request (13:47:43Z). No model swap beyond the initial codex→opencode fallback.
- **Close-out:** gate completed in 571 s; two UI verification runs each captured 2 of 2 shots with clean console (15:07:47Z, 15:25:20Z).

## What went wrong

- **Primary agent unavailable all day.** `codex` + `gpt-6-luna` was paused out of usage (provider quota) since 07:09:32Z; every dispatch fell back to `opencode` + `glm-5.3-flash`. No action needed beyond the fallback.
- **Engineer instability in the first hour.** An orphaned engineer (pid 94488) was stopped at 09:51:24Z and the agent exited with an error; crash recovery resumed it. The worktree then sat with a stale "recorded live engineer" record (pid 3767) that made watchdog auto-resume and active-without-engineer recovery fail repeatedly between 10:00 and 10:38Z; the same happened with pid 11988 at 14:15:26Z.
- **Long nudge/turn-end loop (12:47–13:47Z).** The engineer repeatedly exited cleanly without a handoff (exit code 0) or was ended to deliver a queued CTO nudge (exit code 130), and nudges queued faster than they were delivered — including one held because another was already queued. During this window the engineer was waiting on long background `repoos check` runs and reported them progressing rather than handing off; it was eventually stopped by request at 13:47:43Z and restarted.
- **Wrong test invocation.** The engineer's first test run produced 62 failures ("install @vitejs/plugin-vue") because vitest was run directly, bypassing the repo's two-pass `bun run test` wrapper. With the proper runner the same suites passed. This is exactly the trap AGENTS.md already warns about.
- **Load-dependent contrast-audit flake.** The first remote-validation run of the rendered contrast audit reported 154 `clear-light` settings failures (light-theme text over the dark theme's panel color, a mixed-theme sample) and survived the audit's own retry. The diff touched no theme token and the screen renders identically on `main`; re-running the identical commit inside the `repoos-ci` container minutes later passed twice with zero findings. Recorded in the QA doc as an environmental flake, consistent with the #0596/#0617 history — no code change made.
- **Report finalization error.** At 15:49:36Z server finalization failed with "Engineering report must begin with `## TL;DR`; remove any text before it"; the agent exited with an error and crash recovery resumed. The report was fixed and handoff succeeded at 16:07:43Z.
- **Stale handoff captures.** Review pass 2 found the declared shots captured for an earlier tree (55445a8ce vs reviewed 2babf320f). The reviewer verified the delta directly (the round-1 fix plus an apostrophe change) rather than blocking; both shots were re-captured with clean console at 15:25:20Z.

## Learnings

- **A QA pass over failure modes should hunt "hangs silently", not "shows the wrong message".** All three real bugs were variants of an unbounded wait; error copy was already decent everywhere. This belongs in the QA-pass playbook — a good candidate for `docs/` alongside the existing QA conventions.
- **Timeout budgets belong on boot-critical calls first.** Await-chains through router guards and `onMounted` turn one unbounded request into a whole-app freeze; a global fetch wrapper was deliberately rejected as too broad. Worth a line in `docs/agent-ui-and-preview-conventions.md` or a short ADR if the pattern recurs.
- **A recovery banner is a claim about the world** — it must be retracted the moment the claim is false, not when the user next interacts, and the invariant must be applied at *every* site that marks the stream healthy (the review-pass-1 gap). This is a durable UI convention candidate for `docs/agent-ui-and-preview-conventions.md`.
- **Reuse one error-panel pattern** (`.page-load-error`) so plain-English recoverable failure is testable once and present everywhere — already landed in code; the convention is worth capturing with the banner rule above.
- **Load-dependent contrast-audit flakes are a known class** (#0596/#0617); disposition is evidence, not defensive CSS. Already recorded in the QA doc; `docs/debugging-check-failures.md` is the right durable home if it recurs.
- **"The tests are broken" usually means "I invoked them wrong"** — the `bun run test` wrapper rule already lives in AGENTS.md and held up.

## Follow-ups

- **#1236** — Bound LoginView's auth status/health/me fetches: same unbounded-fetch class the pass fixed elsewhere, found by both review passes and explicitly declared out of scope in the QA doc.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
