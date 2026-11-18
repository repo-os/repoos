## TL;DR

QA pass over the Deployments, Dev and Context pages, driven headlessly against the auth-less dev server, shipped as a QA record (`docs/qa/2026-11-deployments-dev-context.md`). No application bug was found, so the change is docs-only. The first review rejected the initial record for two coverage gaps (empty Deployments state unproven, Discover left in its loading state); a second pass fixed the test methods, documented both states with request-level evidence, and the task closed as good to go.

## Outcome

The task was a QA sweep of three pages — Deployments, Dev and Context — checking populated and empty states, controls, console errors, and 1280px/375px layouts. The engineer ran headless Playwright Chromium against `just serve-noauth` from the task worktree and committed the findings to `docs/qa/2026-11-deployments-dev-context.md`.

What was verified:

- **Deployments (populated):** real data (prod/main branches, service rows, provider destinations, environment bindings); Refresh works; the Deploy confirmation dialog was opened and its copy inspected, then cancelled with Escape since confirming would push to a shared remote.
- **Deployments (empty):** proven on a second pass via an exact `**/api/deployments` interception installed before fresh navigation; the page showed its "deployments not configured, `[[deployments]]` needed" guidance, with correct width at 375px.
- **Dev:** five real configured targets (server/build/process types); Refresh and Start controls present; empty state verified by browser-side API interception, without mutating project config.
- **Context:** Docs/Skills/Discover/History tabs exercised. The Discover catalog load was confirmed on the second pass by clicking the Discover button from the Docs tab, observing a request to `/api/skill-registry/curated` return HTTP 200 with visible catalog entries within 60 seconds, no console or page errors.
- **Layouts:** document width matched the viewport at 1280px and 375px on all routes, including empty states.

Not verified, deliberately: an actual deploy push and a Dev Start launch — both have real side effects (remote push, launching project processes), so the controls were inspected but not executed.

Final verdict: **good to go** (review pass 2). No application bug was found; no source change or regression test was needed.

## Process stats

- **Dev rounds:** 2. **Review passes:** 2 (pass 1 "needs some work", pass 2 "good to go").
- **Wall-clock, created → done:** 42 minutes 21 seconds (2026-11-18T15:47:34Z → 16:29:55Z). Close-out gate itself: 101s.
- **Engineer:** agent `codex`, model `gpt-6-luna`. One engineering session: 576s elapsed, 5,815,175 tokens. No restarts or model swaps recorded.
- **Reviewers:** agent `reviewer`, model `gpt-6-luna`, two sessions: 26s / 100,616 tokens (pass 1) and 23s / 100,505 tokens (pass 2).
- **Routing:** three Model router (openrouter) sessions, 0–1s each, model "unknown", tokens not recorded.
- **Cost:** not recorded for any session.

## What went wrong

- **Round 1 failed review ("needs some work").** The reviewer found the QA record did not establish the empty Deployments state (only populated data was documented) and that Discover was still showing "Loading Skills.sh…" when the pass ended. Resolved by a second engineering round with corrected test methods; pass 2 returned "good to go".
- **QA-script selector mistake (round 1).** The empty-state probe used a generic `<main>` selector, which this app's layout doesn't have; Playwright waited until timeout. Fixed by targeting the actual `.main` app container. A test-harness error, not an app bug.
- **First empty-Deployments interception didn't take effect.** The Deployments page loader uses a page-data cache, so a route interception that wasn't registered before navigation left already-loaded data visible, making the probe inconclusive. Fixed in round 2 with a fresh page, an exact `**/api/deployments` interception registered pre-navigation, and explicit request/response trace evidence.
- **Direct `?tab=discover` navigation didn't exercise the catalog load.** The request is started by a watcher on tab change; visiting the tab by URL query rendered it without firing the load. Fixed by performing the actual user action (clicking Discover from the Docs tab) with request/response listeners attached.
- **No crashes, stalls, failed handoffs or flaky checks** were recorded. Shots were skipped on both handoffs because the diff touched no capture target's globs (docs-only change).

## Learnings

- **The app's page shell is `.main`, not a semantic `<main>` element.** Future headless probes (and any DOM-targeting conventions in `docs/agent-ui-and-preview-conventions.md`) should target `.main`; a `<main>` selector will time out.
- **Verify cached views by installing API interception before navigation** and confirming the request actually matched; a populated-looking page can mean the fixture never took effect.
- **Async work attached to a tab-change watcher is only exercised by performing the tab change** — a URL query that renders the tab doesn't prove the load path fired. Waiting alone doesn't establish completion either; response status plus visible loaded data together do.
- **Controls with external consequences (deploy push, dev start) can be QA'd up to the confirmation dialog**; recording the inspection and the boundary honestly is better QA evidence than clicking through without authorization. Worth a line in the QA conventions doc (`docs/agent-ui-and-preview-conventions.md` or the QA docs index) so future QA passes follow the same pattern.

## Follow-ups

None.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
