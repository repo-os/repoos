## TL;DR

Task #1257 was a QA pass on Work board search, saved filters and sort persistence. The concrete defect found: the phone queue (below 720 px) keeps its search and quick filters in the URL, but the desktop board at 720 px and up silently ignored those URL filters with no sign tasks were hidden. The fix shares one filter predicate between queue and board, renders the active filters as a chip bar with a Clear filters control at 375/768/1280 px, and shows explicit "ignored" chips for unusable URL values. It took 3 engineering rounds and 3 review passes (two `needs some work`, then `good to go`); the branch landed as commit `769eb05151` with release success. Two product gaps were filed as follow-ups (#1259, #1260).

## Outcome

What shipped:

- `src/ui-app/src/lib/workQueueFilters.ts` — new shared module holding the filter type, the URL-query reader, the predicate (moved unchanged out of `MobileWorkQueue.vue`), the chip list, ignored-value notices, and a clear helper that removes only the five queue filter keys while keeping `status`, `task`, `tab`, null values and repeated values.
- `src/ui-app/src/components/BoardQueueFilters.vue` — chip bar showing each set filter, dashed "ignored" chips for unusable values (e.g. `?priority=p9`, `?mine=0` with a notice naming the accepted value `mine=1`), and Clear filters.
- `WorkView.vue` now applies the queue filters in `visibleByStatus`, so columns, counts and keyboard navigation agree; the bar shows on both the board and the pipeline view (the latter with an explicit "doesn't filter" note).
- Tests: 19 browser-suite cases (8 jsdom behavior covering reload, project switch, clear-all; WebKit fit checks at 375, 768 and 1280 px) plus a pure-logic suite, all passing. By round 3 the combined runs covered 29 tests.
- `docs/qa/2026-11-filter-persistence-qa.md` committed, recording scope, per-width results, fixes and remaining gaps (board doesn't apply queue sort, mobile-only status values, no wide-width search input, untested reload race, real-device touch targets deferred to a human).

Not shipped (by design): a search input on the desktop board, per-project namespacing of the sort/toggle localStorage keys — both documented as gaps; the latter argued safe because projects are separate origins.

Final verdict: review pass 3 returned **good to go**; the task closed as done with `release:success` and merge commit `769eb05151fa7ee1b392864747740c165120ec16`.

## Process stats

- Created 2026-11-20T00:07:29Z; done 2026-11-20T03:33:05Z — 3 h 25 m 36 s wall-clock (arithmetic on the two recorded timestamps).
- Engineering rounds: 3 (00:49:34Z, 01:40:37Z, 02:14:08Z). Review passes: 3 (two `needs some work`, one `good to go`); handoff requests at 00:49:35Z, 01:40:37Z, 02:14:08Z.
- Agents/models: engineer ran as **claude code · haiku**; reviewer as **opencode · opencode-go/glm-5.3-flash** (3 reviewer sessions: 86 s, 51 s, 124 s). No model swaps recorded.
- Restarts: one orphaned engineer process (pid 46470) adopted at 00:17:11Z; one watchdog restart of the engineer at 02:00:21Z.
- Tokens/cost (recorded sessions table): engineer 131,396 tokens / $6.3733090899999985 over one session of 4,218 s; reviewers 43,641 + 34,102 + 52,921 = 130,664 tokens / $0.01654165 + $0.00861359 + $0.02407713 = $0.04923237. Recorded total ≈ $6.4225. Note: the sessions table lists only the first engineer session; tokens for the post-restart engineer turns are not recorded, so the engineer total undercounts.
- Close-out gate completed in 884 s (03:31:57Z).

## What went wrong

- **Merge conflict with main on `WorkView.vue`** (review passes 1 and 2 failed server preflight on it). Pass 2 classified it as the only open bug: no merge of main had landed since pass 1. Resolved by round 3: `cb1bc414b` merged main cleanly (main's side kept verbatim, verified byte-identical by the reviewer); `repoos sync 1257` had been refused while an agent turn was in progress, and the engineer's sandbox barred direct `git commit`, so the merge waited for a post-restart turn. A `git merge-tree` dry-run had predicted it would be clean.
- **UI verification failure at 01:32:05Z** — a declared highlight `.board-queue-filter-note` matched nothing on `/work?tab=pipeline&q=login`. Fixed in round 2 by actually adding the pipeline "not applied" note and re-declaring shots; verification then passed 2-of-2.
- **Engineer turn ended without a handoff at 01:18:33Z** (exit code 143) — it ended its turn while a background UI smoke run was still going, to let a queued message deliver. Recovered via message delivery at 01:20:36Z and continued work.
- **Watchdog restart at 02:00:21Z** — a queued message had waited 3 minutes with no live engineer process; the engineer was restarted and the message delivered.
- **Message overdue at 03:19:26Z** — after the good-to-go verdict, a queued message sat undelivered 60 minutes; close-out proceeded anyway and completed.
- **Scoped check skipped its test step** (remote validation runner, `REPOOS_SKIP_TESTS=1`); the engineer covered it with targeted `bun run test` runs of the touched suites.
- **Test-isolation failure in `board-column-labels.test.ts`** (a DashboardView block unrelated to the diff): three WorkView mounts were never unmounted and broke the next mount once WorkView read `route.query` during render. Fixed by adding the missing `unmount()` calls; the file passes 16/16. This was a test defect, not a production bug.
- **WebKit suite needs `dist/ui` built** — expected on a clean worktree; resolved with `bun run build:ui`.
- Several CTO nudges were held (handoff gate running, undelivered message already queued, remote validation running) — normal gating, no action needed.
- Review pass 1's claim about a `?q=%23` chip was stale: round 3 re-checked the code, found it already fixed and covered by an existing test, and changed nothing there.

## Learnings

- Filter state that lives only in a narrow-screen component is invisible to the rest of the app. The fix was to read the URL keys where the board renders and share one predicate module, so queue and board agree by construction. (Recorded in `docs/qa/2026-11-filter-persistence-qa.md`.)
- The bug class here is **silent drops** — a filter a view doesn't apply, or a URL value a reader can't use. An explicit chip or note for every such case is cheaper to verify than proving nothing was dropped; ignored-value notices should name the accepted value, not just the bad one.
- A "per project" requirement needs a concrete definition before code can meet it; here separate origins already separate storage, and writing that down as a documented gap beat namespacing keys on a guess.
- Always `unmount()` mounted views in component tests; cross-test leakage surfaces as failures in unrelated test blocks once a view starts reading `route.query` during render. (Durable candidate for `docs/agent-ui-and-preview-conventions.md`.)
- `git merge-tree --write-tree HEAD main` is a cheap, side-effect-free dry run for a pending `repoos sync`.
- Re-check a review finding against the current code before acting on it — review text can drift from the branch.
- Process observation: engineer token/cost totals are incomplete when a watchdog restart spawns engineer turns that never appear in the sessions table. (Candidate for the close-out/reporting docs.)

## Follow-ups

- #1259 (ready, created 2026-11-20T00:57:29Z): Work board needs a search control at wide widths using the same predicate and URL keys as the phone queue — filed because the desktop board can currently only receive filters via URL.
- #1260 (ready, created 2026-11-20T00:57:33Z): Apply the queue sort on the board and make mobile-only status values visible as chips — filed for the two remaining documented gaps (board ignores `sort=oldest`; `?status=attention|held|…` shows every task with no chip).

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
