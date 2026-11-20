## TL;DR

Task 1266 was a QA sweep of the Activity and Insights pages. No Insights page exists in the UI, so the sweep covered the Control dashboard (`/`) — labelled "Activity" in the mobile More sheet — and its live activity feed. The headless Playwright walk at 375, 768 and 1280 px found no overflow, page errors or missing focus rings, but uncovered two real bugs in the feed's data path: free text interpolated unescaped into `v-html` feed messages at eight `pushFeed` call sites, and seven server event types that had store handlers but were never subscribed, making those branches dead code. Both were fixed with table-driven tests, a QA note was added under `docs/qa/`, and review returned `good to go`. The task landed as merged commit `90f95d8`.

## Outcome

The task's premise ("Insights page") did not match the codebase: a search of the UI source, router, nav and docs found no Insights route, and "Activity" exists only as the mobile More-sheet label for the dashboard. Rather than invent a page, the engineer documented walking the dashboard's live activity feed as the remaining un-walked activity surface (earlier QA notes had already covered the dashboard's resource and usage panels). Shipped:

- **Feed escaping fix** (`src/ui-app/src/stores/repo.ts`): eight `pushFeed` call sites that interpolated raw event fields (task title, run labels, self-heal notes, auto-approve rules, preview URLs, review errors, generic error message) into the `v-html` feed message now escape the text. Previously, a task title containing markup would render as HTML. `escapeHtml` also now accepts `unknown` and coerces `null`/`undefined` to `""` so a partial SSE payload no longer throws inside the event handler.
- **Dead-subscription fix** (same file): seven event types with store branches but no subscription were added to the EventSource subscription list — `task.autoApproved` (missed when the approval-policy commit added the branch), `task.debugTldr`, `task.doneErrorTldr`, `agent.queued`, `agent.dequeued`, `auto-engineering.state` and `bookkeeping.recovered`. Three types (`board.alert`, `release.notesRun`, `supervisor.heartbeat`) correctly stay unsubscribed as they have no UI handler.
- **Tests** (`src/ui-app/tests/repo-store.test.ts`): two table-driven blocks — one feeds an `<img onerror>` payload through each changed branch and asserts the escaped output, the other asserts each newly subscribed name registers on the fake EventSource.
- **QA note**: `docs/qa/2026-11-activity-qa.md` documenting scope, method, results and the one item deliberately left alone (a floating toast overlapping the page title at 375 px, which is by design).

Diff: 1 new file, 2 modified files (+142 / −11).

**Final verdict:** `good to go` on review pass 1, annotated `EVIDENCE-GAP-ONLY` — the code was judged sound; the sole automated capture caught a loading state rather than a settled page, but the diff has no visual change to show, so no declared shots were required.

## Process stats

- **Dev rounds:** 1 (round 1, Claude Code on haiku).
- **Review passes:** 1, verdict `good to go` at 2026-11-20T04:00:47Z.
- **Wall-clock, created → done:** 2026-11-20T03:07:06Z → 2026-11-20T08:52:55Z = 5 h 45 m 49 s. Of that, active work was 2026-11-20T03:08:12Z → 03:54:43Z (≈46.5 min to handoff) and close-out took 486 s (gate completed 08:52:18Z). The long tail was review-approval to close-out (≈4 h 52 m), during which a queued message sat overdue.
- **Agents and models:**
  - Engineer: haiku (Claude Code) — 1525 s, 41,274 tokens, $0.3136.
  - Reviewer: opencode-go/glm-5.3-flash — 351 s, 53,708 tokens, $0.02743.
  - Routing: Model router (jev) — 0 s, tokens/cost not recorded.
  - Restarts or swaps: none recorded.
- **Total recorded cost:** $0.3411 (sum of the two known figures).
- **Linked tasks:** none recorded.

## What went wrong

- **Scope mismatch: no Insights page.** The task named a page that doesn't exist. Resolved by documenting the interpretation in the task notes and QA doc instead of inventing a page; the reviewer confirmed the substitution was still relevant.
- **First `build:ui` run produced nothing.** A background build emitted no output and no `dist/ui` because the shell call ended and killed it. Resolved by rerunning the build in the foreground.
- **Bare `vitest` run failed with 67 errors** because invoking it directly skipped the jsdom environment (`window` undefined). Resolved by running through `bun run test`, as the repo's convention already prescribes — a usage note, not a code bug.
- **Orphaned run process killed.** At 03:54:43 the system stopped an orphaned bun process (pid 83792, ~1 s CPU, 20 s old) from the task worktree; the handoff to review succeeded immediately after.
- **CTO nudge: task held at 03:36:09** because the handoff gate was running. Resolved normally — the gate finished and status moved to review at 03:54:43.
- **Queued message overdue.** A message queued at 03:54:44 was flagged overdue at 04:55:04 after 60 minutes undelivered; its content and resolution are not recorded. The task nonetheless closed out successfully at 08:52:55.
- **Evidence gap at review.** The only automated capture showed the loading state (`aria-busy`), and populated-feed states could not be fixtured in a static capture (non-auth API fixtures returned 503). Accepted as non-blocking because the diff is non-visual and the headless walk was documented in the QA note.
- **Tab-order verification limitation.** Headless WebKit's Tab never left `BODY`, so the walk focused each control directly and checked its computed focus ring; actual Tab order was left unverified, and the reviewer recorded this as an edge case.
- **112 pre-existing `vue-tsc` type errors** in unrelated test files. Not fixed — they predate the branch and are outside this task's scope.

## Learnings

- **An unsubscribed handler is invisible dead code.** When a server event type gains a store branch, the EventSource subscription list must change in the same commit; diffing `live-index.ts`'s event union against the subscription array is a cheap check whenever either side changes. A test now guards the seven names. Worth a durable line in `docs/agent-ui-and-preview-conventions.md` (or a lint-style guard), since the union-vs-subscription diff is currently manual — the reviewer flagged exactly this.
- **`v-html` feed messages are a standing injection surface.** Every new `pushFeed` call must escape free text; the escape test block is the place to add the next hostile payload. The reviewer verified the remaining 11 call sites interpolate only server-controlled ids/enums/counts, but the rule belongs in docs, not just this report.
- **Confirm a named page exists before planning QA fixtures.** "Insights" existed only in the task title; checking the router/nav first avoided building fixtures for a nonexistent page.
- **Reviewer suggestions not yet actioned** (no tasks were filed): consider asserting `applyEvent` actually runs in the subscription test (listener registration alone wouldn't catch a typo'd name plus missing branch); the per-frame `try/catch` around `applyEvent` swallows handler errors silently, so a bug in a newly active branch would vanish without a trace — a pre-existing behaviour worth its own follow-up.
- **`bun run test`, never bare `vitest`/`bun test`** — already codified in AGENTS.md; this task is another data point that violating it costs a confusing wall of 67 failures.

## Follow-ups

None. No linked tasks were recorded for this task; the reviewer's suggestions above (subscription test depth, `applyEvent` error swallowing) are candidates for an Easter-eggs bundle but were not filed.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
