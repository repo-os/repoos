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

A QA pass over the Releases cut flow (notes chooser, blocked, running, failed and success states) at 1280×900 and 375×812 found no product bug; the mobile drawer already scrolls long content while keeping the Publish/Cancel footer visible. What shipped is a repeatable headless Playwright harness (`docs/qa/measure-releases-cut-flow.mjs`) that intercepts all release APIs and fails on any release POST or uncaught page error, plus the QA record `docs/qa/2026-11-releases-cut-flow.md`. Review pass 1 flagged a real gap (collected browser errors didn't fail the run); round 2 fixed it, pass 2 returned "good to go", and the task closed cleanly.

## Outcome

The task asked for a rendered QA pass of the Releases cut flow at desktop and phone widths, with headless Playwright only against the auth-less dev server, intercepted release APIs (never a real publish), bugs fixed with tests, and a committed doc under `docs/qa/`.

What shipped:

- `docs/qa/measure-releases-cut-flow.mjs` — a headless Chromium script that intercepts `/api/release*` with synthetic fixtures (ready status, dirty-tree blocker, running check, failed check with test output, successful run, unconfirmed notes chooser), counts release POSTs and fails the run on any nonzero count, and asserts per state × viewport: no horizontal overflow, chooser fit, disabled cut entry under blockers, running-state step naming, failed-state summary, success outcome, and footer staying inside the viewport.
- `docs/qa/2026-11-releases-cut-flow.md` — the retained QA record documenting the matrix, safety boundary and results.

Findings: no product bug surfaced, so no UI change and no product regression test were needed. The drawer already behaves correctly at 375px — `.drawer-body` owns the overflow and the action footer stays anchored at the viewport bottom, including in the failed state with long command output. Screenshots were kept out of the branch (ignored `.repoos/qa-releases-cut-flow/`).

Final verdict: review pass 2 "good to go"; the close-out gate completed successfully and the branch merged (`release:success`, merged commit `79bb441`).

## Process stats

- Engineering rounds: 2 (round 1 active→review 22:27:47Z; round 2 after review bounce, active→review 22:32:21Z).
- Review passes: 2 — pass 1 "needs some work", pass 2 "good to go".
- Wall-clock start to done: 23 minutes 40 seconds (created 2026-11-18T22:17:29Z → done 2026-11-18T22:41:09Z).
- Agents/models:
- Engineer: `engineer` · codex · gpt-6-luna — 1 session, 734s, 12,388,011 tokens, cost not recorded. No engineer restarts or model swaps; both rounds ran in the same session.
- Reviewer: `reviewer` · gpt-6-luna — 2 sessions: pass 1 26s / 100,610 tokens; pass 2 22s / 145,501 tokens; costs not recorded.
- Routing: 3 Model router (openrouter) sessions, 0–1s each, model unknown, no token/cost data.
- Close-out gate: completed in 66s.

## What went wrong

- **Browser-error assertion gap (real, caught by review).** The round-1 harness collected `pageErrors` and printed them but never failed the run — so the QA record's "no uncaught errors" claim wasn't enforced. Review pass 1 flagged it as the only defect; round 2 made the harness throw state/viewport-specific errors when the list is non-empty, reran all ten state×viewport combinations (all empty `pageErrors`, zero release POSTs), and pass 2 confirmed the fix.
- **`networkidle` never settles.** The app keeps its event stream open, so Playwright's `networkidle` readiness stalls indefinitely. Fixed in the harness by waiting for `domcontentloaded` plus route-specific UI elements (the drawer and its controls) — no application change.
- **Wrong test-id attribute.** Playwright's default `data-testid` lookup doesn't match this codebase's `data-test-id` convention; locators were switched to explicit CSS selectors. Harness issue only.
- **Initial phone-height choice misleading.** The failed state was first inspected at 900px height and the footer looked edge-of-viewport in the capture; direct geometry checks plus a rerun at a phone-realistic 812px showed the footer correctly pinned at the viewport bottom with `.drawer-body` owning the scroll.
- **Review report file missing locally.** During round 2 the review report wasn't present at the checked-out `.repoos/reviews/1206` path; the engineer worked from the queued review message after confirming via `repoos list` that #1206 had returned to `active` and the worktree was clean. Resolved without editing during review.

No failed gates, flaky checks or crashes otherwise. The scoped `REPOOS_CHECK_CHANGED=main repoos check` passed on the final tree both rounds; it classified the diff as docs/bookkeeping-only, so unrelated build/lint/test/UI-smoke steps were skipped while formatting, branch-artifact, task-asset and task-parser checks ran.

## Learnings

- **`networkidle` is unreliable for this app's UI harnesses** — the long-lived event stream keeps the network busy. Wait for a route-specific element instead; it's also a better failure signal when a screen doesn't mount. This is recorded in `docs/qa/2026-11-releases-cut-flow.md`; if it recurs in other QA work it belongs in `docs/agent-ui-and-preview-conventions.md`.
- **A QA harness must fail on the conditions it measures.** Collecting diagnostics (page errors, safety counters) without asserting on them gives a false "passed". The fix is in the committed script; the principle is worth a line in the QA-docs conventions if more measure scripts follow.
- **The release drawer's mobile layout is confirmed good**: body scrolls independently, footer stays reachable, even with long failure output. No follow-up needed there.
- RepoOS uses `data-test-id`, not Playwright's default `data-testid` — a recurring trap for new browser harnesses; candidates for the UI conventions doc.

## Follow-ups

None recorded.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
