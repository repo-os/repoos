## TL;DR

Task 1267 shipped per-shot viewports for UI shots. A declared shot can now name `viewport: phone` (390x844), `tablet` (820x1180) or `desktop` (1280x800); undeclared web targets are automatically captured at phone and desktop, tablet only when declared; every web caption names its size. One engineering round and one review pass (verdict `good to go`); the task landed with merge commit `1f220ea`. The session's one real failure was outside the shot code: two WebKit responsive tests stalled at 375 px because the Vite dependency optimizer re-hashed bundles mid-page-load (`504 Outdated Optimize Dep`), fixed with `optimizeDeps.entries` in the two test servers.

## Outcome

Shots now carry a size. Concretely:

- `repoos update --shots` accepts and validates an optional `viewport` field per shot; unknown values are rejected with the list of valid ones. A preset that contradicts an explicitly given width/height is rejected; agreeing values are accepted.
- Handoff capture honours the viewport per declared shot. The automatic fallback (`buildCapturePlan`) emits one entry per web target per fallback viewport — phone then desktop — while declared shots never fan out and command targets stay single-entry.
- Captions carry the size through `provenanceCaption` (e.g. `· phone 390x844`), so every caption path shows it without per-caller edits. A declared shot without a `viewport` names the desktop default it actually gets.
- `repoos shot --viewport WxH` pins automatic capture to one size; without it, capture fans out to phone and desktop (help text updated).
- Docs updated: `docs/agent-ui-and-preview-conventions.md` (viewport behaviour + capture-time cost), `docs/previews.md`, `user-docs/review-and-close-out.md`, `user-docs/cli.md` (the `viewport` key).
- Tests: 101 tests across the shot-plan and viewport suites pass; a new `src/ui-app/tests/shot-viewport-1267.test.ts` was added. The two flaky WebKit responsive test files were also fixed (harness only; layout assertions unchanged).

Design note kept from the round: the numeric `viewportWidth`/`viewportHeight` fields remain the stored truth; `viewport` is a named spelling of them, so capture, collapse key, plan fingerprint and reuse logic needed no change.

Final verdict: review pass 1 returned `good to go`; the task closed as `done` with `release:success`.

## Process stats

- Engineering rounds: 1 (round 1, Claude Code, model `haiku`).
- Review passes: 1 (opencode, model `opencode-go/glm-5.3-flash`, verdict `good to go`).
- Wall-clock, created → done: 5h 53m (2026-11-20T03:17:57Z → 09:11:10Z).
- Status timeline: created 03:17:57Z → ready 03:18:22Z → active 03:18:44Z → review 04:53:09Z → done 09:11:10Z.
- Engineer session: agent `engineer`, model `haiku`, started 03:19:27.925Z, elapsed 3944s, 64,409 tokens, cost $0.79606291, finished.
- Reviewer session: agent `reviewer`, model `opencode-go/glm-5.3-flash`, started 04:53:20.670Z, elapsed 229s, 76,436 tokens, cost $0.05699157, finished.
- Routing session: model router (jev), 0s, tokens/cost not recorded.
- Recorded totals: 140,845 tokens, $0.85305448 across the two sessions above.
- Restarts: one watchdog restart of the engineer (04:00:35Z). No model swaps recorded.
- Close-out gate: completed in 1022s (finished 09:10:18Z).
- Branch was 86 commits behind main at round time; main was not merged in this session.

## What went wrong

- **Handoff gate failure, 03:57:25Z.** Remote validation failed two WebKit responsive tests (`checks-live-run-responsive`, `checks-releases-data-responsive`) at 375 px. Diagnosis in two steps: raised timeouts first (default page budget 30s; 60s test timeout on the Releases file), but the 375 px cases still stalled 30s even sequentially, ruling out slow starts and cross-file contention. Temporary console/network logging showed the real cause: Vite's dependency optimizer discovers `vue` and `pinia` on first page load (it scans only `index.html`), re-hashes the optimized bundle, and already-requested `vue.js`/`pinia.js` return `504 (Outdated Optimize Dep)` — the view never mounts. Fix: `optimizeDeps.entries` pointing at each test server's fixture entry and store stub, so dependencies are pre-bundled. Diagnostic logging was removed afterwards. Resolved; the re-run scoped gate passed end to end, including all nine live-run and three releases WebKit cases, and review moved to `review` at 04:53:09Z.
- **Watchdog restart, 04:00:35Z.** The engineer was restarted because a queued message had waited 3m with no live process; the message was delivered at 04:00:44Z.
- **CTO nudges, 03:42:14Z and 04:52:30Z.** Both reported "held — handoff gate is running"; informational, no action needed.
- **Message overdue, 05:59:43Z.** A queued message was still undelivered after 60m. The activity log records no delivery for it; how it was resolved is not recorded.
- **Unverified visual result.** No headless capture of a real page was driven through `captureEntryPage` this session, so the phone frame's visual result has not been looked at. The reviewer flagged a glance at one real phone capture once a preview is requested as a non-blocking suggestion. No browser console-error check ran (UI handoff browser verification did not apply), and no guard negative-test evidence was required (no check guard rules materially changed).

## Learnings

- **Vite test-server first-load stalls are optimizer state, not slowness.** A WebKit test failing only on a file's first page, with a long stall and no layout error, is likely a dependency-optimizer re-hash (`504 Outdated Optimize Dep` in the console); raising the timeout hides the stall without fixing it. `optimizeDeps.entries` on the test server is the fix. This belongs in `docs/agent-debugging-and-incidents.md` as a worked example.
- **Presets as spelling, not new state.** Adding `viewport` as a name for the existing `viewportWidth`/`viewportHeight` meant capture, fingerprinting and reuse code needed zero changes. Worth keeping in mind for future enum-style extensions of shot plans.
- **`provenanceCaption` as the single caption renderer** let a fact every caller must display propagate without touching call sites — a pattern worth reusing for metadata that must appear in output.
- **Don't overload per-command caps for fan-out.** `maxAutoShots` caps command output files; reusing it for web viewports would have silently dropped phone captures. It was deliberately left untouched.
- The reviewer also suggested importing the core `DEFAULT_SHOT_VIEWPORT` constant in `src/commands/shot.ts` instead of a local duplicate, to prevent drift — not acted on; a candidate for a small cleanup task if it matters.

## Follow-ups

None. No new tasks were filed (linked tasks: none recorded). Two soft items remain outside the task system: the one-time visual check of a real phone capture (reviewer suggestion, non-blocking) and the `VIEWPORT` constant deduplication noted above.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
