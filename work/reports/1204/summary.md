## TL;DR

Task 1204 was a hands-on QA pass of the Inputs and Context pages at 1280px and 375px, run entirely with headless Playwright against the auth-less dev server from a scratch worktree. The pass surfaced a real state-reporting bug — failed list requests rendered as successful empty results — plus a family of concurrent-refresh races found across four review passes. Inputs and Docs listings now distinguish loading, failure, and genuine emptiness, treat the newest refresh as authoritative for data, shared loading/error flags, and the result returned to callers, and guard document-preview loads against a stale fetch overwriting a newer selection. All four engineering rounds and all five review passes ran on codex / gpt-6-luna; the fifth review passed with "good to go" and the task closed out cleanly.

## Outcome

What shipped:

- **Retryable failure states for Inputs.** `refreshInputs()` now reports success/failure instead of swallowing errors; the Inputs view shows an error banner with Retry in both list and board modes, preserves already-loaded data on failure, and clears the error only after a successful retry.
- **Loading / error / empty separation for Context Docs.** The docs store exposes loading and error state; the Docs tab shows "Loading docs…", an error with Retry, or "No docs found" only after a successful empty response.
- **Concurrent-refresh correctness.** Both stores use monotonically increasing request versions: stale responses cannot replace newer data, stale completions cannot corrupt shared loading/error flags, and overlapping `refreshInputs()` callers resolve to the newest request's outcome (an older success can no longer clear a newer failure's banner).
- **Preview-load safety.** `loadDoc()` uses a selection version plus selection check so an older file fetch cannot replace content for a newer selection; a refreshed listing re-selects a valid document if the current one disappeared.
- **QA evidence fixed at the required widths.** Declared handoff shots carry explicit `viewportWidth`/`viewportHeight` (1280×900 and 375×812), and the 375px Context capture opens at a new `context-top` page anchor instead of a scrolled position.
- **Required doc:** `docs/qa/2026-11-inputs-context.md`, updated across rounds with the responsive, failure-state, and request-ordering findings.
- **Regression tests** in `docs-store-search.test.ts`, `inputs-view-toggle.test.ts`, and `input-enrichment-pending.test.ts`, covering failure/retry recovery, out-of-order completions, stale success/failure, and preview selection races, using deferred promises rather than timing.

Final verdict: review pass 5 returned **good to go** on 2026-11-18; close-out completed with status done and `release:success`, merged commit `133c140ecffa000005ac4eafaa67b5bad4d3c054`.

## Process stats

- **Created → done:** 2026-11-18T20:47:45Z → 2026-11-18T22:38:55Z (1h 51m 10s wall-clock).
- **Engineering rounds:** 4 (2026-11-18T21:09:26Z, 21:53:42Z, 22:15:53Z, 22:29:05Z), all codex / gpt-6-luna.
- **Review passes:** 5 (21:10:07Z, 21:27:32Z, 21:54:36Z, 22:16:48Z, 22:29:50Z), all codex / gpt-6-luna. Verdicts: 4 × "needs some work", 1 × "good to go". The sessions table lists 4 reviewer sessions; the reason a fifth reviewer session row is absent is not recorded.
- **Model swaps or restarts:** no model swaps recorded; one phantom-runner restart (see What went wrong).
- **Tokens (recorded):** engineer session 44,854,149; reviewer sessions 242,927 (42s), 261,425 (53s), 175,976 (24s), 182,019 (39s) — 862,347 combined. The 10 routing sessions' token counts are not recorded.
- **Cost:** not recorded for any session.
- **Close-out gate:** completed in 477s. The scoped `repoos check --changed main` passed each round (formatting, lint, build, UI guards, rendered contrast, browser smoke, remote changed-path suite of 1,705 tests).

## What went wrong

- **Evidence gap (review pass 1):** the handoff captures were 1024×768, not the required 1280px/375px. Resolved in round 2 by adding explicit per-shot viewport dimensions to the declared shot plan.
- **Stale/cancelled captures (pass 2):** the available captures predated the reviewed HEAD and a browser capture was cancelled at 21:27:43Z. Resolved when round 2 re-captured 4 of 4 shots with clean console at 21:53:41Z.
- **Runner instability (~21:27–21:32Z):** an undelivered queued message sat for 4 minutes with no engineer output; an orphaned engineer pid 83274 was adopted at 21:29:51Z; a phantom runner (no live process) was detected and restarted at 21:31:36Z. The queueing machinery also repeatedly held CTO nudges while the handoff gate or remote validation was running. All resolved by the restart and subsequent delivery; no further runner incidents after 21:32Z.
- **Concurrent refresh races (pass 3):** overlapping `loadDocs()`/`refreshInputs()` calls could apply stale results or corrupt loading/error flags. Fixed in round 3 with request versions.
- **Residual races (pass 4):** a stale success still returned `true` and could clear the view's latest error banner; a stale `loadDoc()` could overwrite newer preview content. Fixed in round 4 with latest-outcome resolution for callers and a selection version for previews. Pass 4 also flagged the 375px Context capture scrolled into content; fixed with the `context-top` anchor.
- **Test-harness friction (rounds 1–2):** the first Playwright failure probe timed out because a background refresh succeeded before the assertion; fixed by holding all matching requests at 503 until Retry. A direct Vitest invocation bypassed the Vue SFC plugin and failed; the repo's `bun run test` wrapper ran the tests successfully.
- **Environment limits:** reviewers could not run `git merge-tree --write-tree` (temporary-file permission denied) in passes 2, 4, and 5; mergeability was instead confirmed by close-out, which succeeded.

## Learnings

- **An empty state is trustworthy only after a successful response.** Loading, failure, and successful emptiness need separate representations; an initial empty array silently makes a failed request look like an empty project. This is a general UI-store rule worth adding to `docs/agent-ui-and-preview-conventions.md`.
- **Concurrent refresh correctness has three layers:** which data is authoritative, which request owns shared loading/error flags, and which outcome a waiting caller should use. Guarding data alone is insufficient — an old `finally` can hide a running request and an old success can clear a newer failure's banner. Durable enough for a short ADR or a section in `docs/agent-ui-and-preview-conventions.md`.
- **Preview content has a separate lifetime from its listing**; selection changes must invalidate outstanding fetches for the previous selection.
- **Failure probes in Playwright must hold all matching requests** (startup, background, and retry refreshes issue more than one) until the user action, or the error state is unobservable.
- **Declared shots need explicit viewport dimensions** — the default capture viewport was 1024×768 — and capture steps don't support scrolling, so route-level fragment anchors (e.g. `context-top`) are the deterministic way to control scroll position. Worth a line in the shots guidance of `docs/agent-ui-and-preview-conventions.md`.
- **Always run tests via `bun run test`**, not a bare Vitest invocation, when Vue SFCs are involved (already implied by AGENTS.md's runtime rules; reinforced here).

## Follow-ups

None recorded.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
