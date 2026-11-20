## TL;DR

The Work board now honors the phone queue's `sort` URL parameter (`newest`/`oldest` are applied, with a visible "Sort: Oldest updated" chip) and shows a dashed "Ignored filter" chip for every phone-only `status` value (`attention`, `held`, `archived`, `human`, `all`, plus unknown/repeated/bare values), so no URL value is silently dropped on desktop. The phone queue at 375 px keeps owning these values, where they are genuinely applied. Coverage is jsdom unit tests plus headless WebKit fixtures at 375, 768 and 1280 px. The task shipped after 4 engineering rounds and 4 review passes, with the final verdict `good to go` and a successful close-out (gate completed in 702s). Getting there was rough: two watchdog restarts, three failed handoffs (a remote test failure, an unconcluded merge, and a missing report draft), two overdue queued messages, and machine-pressure holds.

## Outcome

Two gaps from the #1257 QA pass (`docs/qa/2026-11-filter-persistence-qa.md`) are closed:

- **Queue sort applied on the board.** A valid `sort=newest|oldest` in the URL orders every board column by last update, using the shared `sortWorkQueueTasks` comparator that `MobileWorkQueue` also calls (moved into `src/ui-app/src/lib/workQueueFilters.ts` so the two views cannot drift). A chip shows the applied sort so a sorted board never looks like the default. The board's Sort control agrees with the URL while a sort is present, and picking a sort in the control drops the URL sort (applied or ignored).
- **Phone-only status values are noticed, not applied.** The board shows only six status columns, so values it cannot apply get an "Ignored filter: status=…" chip in the existing dashed notice style, computed from the raw route value (which catches repeated, bare and empty `status` that a first-element helper would hide). Clear removes everything the bar displays. The chip bar renders only in the desktop branch of `WorkView`, so the phone never shows a notice for a value its own queue applies.

`docs/qa/2026-11-filter-persistence-qa.md` was updated to record the new board behavior and no longer lists this task as an open gap.

**Final verdict:** review pass 4 returned `good to go` (stale-evidence-only — code unchanged since pass 3's clean review, only a re-capture of the handoff shot on the final merged tree). Merged commit `82d78243cb7e117838dce60e3f1b217151f617b1`; release recorded `release:success`.

## Process stats

- **Wall-clock, created → done:** 2026-11-20T00:57:33Z → 15:22:00Z = 14 h 24 min 27 s.
- **Engineering rounds:** 4 recorded rounds (05:47, 05:59, 13:05, 14:30 UTC). Round 3 changed no product code — it confirmed existing wiring and diagnosed the merge/check blockers.
- **Engineer:** 1 engineer agent, Claude Code on `haiku`. Single recorded engineer session started 2026-11-20T04:08:25Z, elapsed 14683 s (≈4 h 04 m 43 s), 94,383 tokens, cost $6.3191661. The watchdog restarted it twice during that span (04:55:17Z and 10:13:34Z). Two later turns ended without a handoff (11:53:21Z, exit 0; 13:29:25Z, exit 143 to deliver a queued message).
- **Reviewer:** 4 review passes, reviewer agent on `opencode-go/glm-5.3-flash`. Recorded reviewer sessions: 42,967 tokens / $0.01553432 (104 s); 62,997 / $0.0306027 (193 s); 36,585 / $0.0111646 (46 s); 42,970 / $0.01594744 (97 s) — total 185,519 tokens and $0.0732491. Each pass had a routing session (model router "jev", model unknown, 0 tokens).
- **Debugger:** one debugger session on `opencode-go/deepseek-v4.1-flash` (09:14:39Z, 7 s); tokens and cost not recorded.
- **Token/cost totals (recorded sessions):** 279,902 tokens; $6.3924152. The engineer's haiku session dominates the cost; reviewer spend was ~1% of it.
- **Verdicts:** pass 1 `needs some work`; passes 2–4 `good to go`.

## What went wrong

- **Handoff failed 3× (04:52:14Z, 10:18:58Z, 13:26:22Z).**
  1. *04:52:14Z — remote validation failed: test failure, gate exit 1 on the mini runner.* The handoff status gave no failing test name and the remote log was not visible, so it could not be reproduced locally. Resolved by fixing locally and re-running the gate; handoff succeeded at 05:47:37Z.
  2. *10:18:58Z — "git commit failed: fatal: cannot do a partial commit during a merge."* A merge of main into the branch had been resolved in the index but never concluded, so RepoOS's task-file commit step refused. Round 3 diagnosed this via `MERGE_HEAD` and did not hand-conclude the merge per runner rules; the merge was later completed properly (merge commit `68400159c`, round 4).
  3. *13:26:22Z — "Engineering report draft is missing: .repoos/engineering-report-drafts/1260.md."* RepoOS consumes the draft during a handoff attempt, so a draft needs rewriting for each request; the engineer rewrote it and handoff succeeded at 14:01:06Z.
- **Review round 1 found a real defect:** the board's Sort dropdown was bound to the store's order while the columns followed the URL, so the two controls visibly disagreed. Fixed in round 2 along with three edge-case findings (repeated/bare `status` silently dropped via `firstString`; an ignored sort sticking until Clear; the pipeline-view note not covering sort).
- **Watchdog restarts and message delays.** Two restarts ("queued message waited 3m with no live process", 04:55Z and 10:13Z). Two messages went overdue after 60 m undelivered (07:07Z, 11:20Z). One turn was deliberately ended (exit 143) so a queued message could be delivered.
- **Load-dependent test flakes.** Across local and scoped-gate runs, different 30–90 s timeouts appeared each run (`agent-review`, `debugger-integration`, `preview-request`, `task-watchdog`, `worktree-gc`, and several WebKit browser cases). Every failing file passed when run alone, and none touched the changed code, so they were read as parallel-load timing flakes — but this was never proven on an idle machine; the remote/post-merge scoped check passing in full is the real confirmation.
- **Machine pressure holds.** CTO nudges held the task repeatedly: system load 5.5× per CPU (limit 3×) with a check-wait escalation past the 30 m handoff deadline, and CPU idle at 0% (below the 5% floor) at 13:53Z. Resolution was waiting for headroom per `pressureGuard`; no self-chosen thresholds were used.
- **Close-out repair.** Despite pass 2's `good to go` at 06:00Z, close-out was blocked by a merge conflict with moved main; the task went back to `active` at 09:14:42Z ("close-out repair: merge-conflict") and was re-reviewed after the merge.
- **Stale handoff evidence.** The final merge of main (bringing #1259's board search and unrelated UI changes) invalidated the declared shot's capture tree; pass 4 confirmed code identity since pass 3 and required a re-capture, after which the server skipped the duplicate shot (already captured for the same plan hash).

## Learnings

- **A URL value is "handled" only if every view that reads it either applies it or says so.** The board and phone queue share keys, so the ignored-value notice path belongs in one shared module (`workQueueFilters.ts`) and must not run on the view that actually applies the value. This pattern is now documented in `docs/qa/2026-11-filter-persistence-qa.md` ("Behavior on the board"); the conventions doc and AGENTS.md were touched in rounds 3–4 — if the apply-or-notice rule is not already in `docs/agent-ui-and-preview-conventions.md`, it belongs there.
- **Read the raw route value, not a first-element helper.** `firstString` quietly hid repeated `?status=` keys from the notice path. A helper that takes element zero makes repeated keys invisible.
- **Clear must remove everything its bar displays,** or a chip becomes impossible to remove from the bar.
- **A merge resolved in the index but not concluded looks clean to a reader yet blocks any partial commit.** Check `MERGE_HEAD` before assuming a tree is clean; this cost one failed handoff. Worth a line in `docs/close-out-pipeline.md` if not already there.
- **Check whether the branch already implements a feature before rewriting it.** Round 3's only real work was diagnosis; the code was done in an earlier turn.
- **Run the repo's own test wrapper, not bare vitest,** when tests import `.vue` files — the project's Vue plugin config is required.
- **Report drafts are consumed per handoff attempt,** so each retry needs a fresh draft.

## Follow-ups

None. No new tasks were filed from this task; the only linked task is #1257 (depends-on, done), the QA pass that surfaced the two gaps. Reviewer suggestions that were noted but deliberately not filed: the done column re-sorts by recent-done under a stored "Priority level" sort, contradicting the sort chip for that column only; and a "use one sort" notice for repeated `sort` keys would mirror the `status` behavior.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
