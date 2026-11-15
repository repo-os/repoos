## TL;DR

Task drawer **Move to done** failed instantly with a misleading "Land anyway requires a reason of 1–1000 characters" error: Vue passed the native click `Event` as the first argument of `moveToDone(reason?: string)`, so a truthy non-string reached `completeTask` as `landAnywayReason`. The fix binds `@click="moveToDone()"`, guards the reason to non-empty strings on client and server (with a clearer server error), adds POST-body regression tests, and documents an audit of sibling `@click` bindings. After 2 engineering rounds and 2 review passes the task landed with verdict `good to go`. The run was dominated by infrastructure trouble — a repeated codex crash loop that crash recovery could not replace because a human-set model override was pinned, and a debugger agent that could never start because its provider had no balance.

## Outcome

The drawer's Move to done button now behaves exactly like the board-card button: a plain click issues the done request with no reason, and only the Land anyway dialog sends a typed, non-empty string reason. Specifically:

- `TaskDrawer.vue` binds `@click="moveToDone()"` instead of the bare handler reference, and `moveToDone` normalises its argument with `typeof reason === "string"`.
- `repo.completeTask` sends `landAnywayReason` only when it is a non-empty string.
- The server done route rejects a non-string `landAnywayReason` with `"Land anyway reason must be a string"` (via an extracted `landAnywayReasonError()` helper), replacing the misleading length error (AC3).
- Component tests in `task-drawer-landable.test.ts` assert the POST to `/api/tasks/:id/done` has no body on a normal click and carries the typed text from the Land anyway dialog (AC2); `done-guard.test.ts` covers the server rejection.
- The `@click` audit (AC4) found `moveToDone` was the only hazardous bare binding in TaskDrawer; `confirmLandAnyway` takes no args, `ModelPlaygroundPanel.send(text?)` is only bound with an explicit argument, and TaskCard calls `completeTask` directly.

The bug had been present since #1081 shipped it in v0.5.83 and v0.5.84. Final verdict: `good to go` (review pass 2), merged as commit `9a00025cdd387f76204f15a0519cd7fd46a5443f`; close-out gate completed in 166s.

## Process stats

- Engineering rounds: 2 (both by the cursor agent on composer-2.5).
- Review passes: 2 (both cursor/composer-2.5). Pass 1 verdict `needs some work`; pass 2 `good to go`.
- Wall-clock start to done: 2026-11-14T16:14:26Z → 2026-11-15T00:35:37Z, i.e. 8h 21m. Note the task was held from 16:15:39Z to 16:45:20Z (reason not recorded), so roughly 30 minutes of that was idle before work began.
- Engineer: cursor / composer-2.5 (main session, 4282s, 1000 tokens — the only token figure recorded; cost not recorded). A gpt-6-luna engineer session also started at the same timestamp and errored after 204s ("Reading additional input from stdin..."). A human-set override pinned codex + gpt-6-luna at creation and was changed at 17:04:01Z; what it was changed to is not recorded.
- Reviewer: cursor / composer-2.5, two sessions (45s and 52s), tokens and cost not recorded. Routing sessions (Model router, openrouter) ran 1s each.
- Debugger: four attempts, all on deepinfra/deepseek-ai/DeepSeek-V4.1-Flash, all errored within 1–2s (see below); no debugging session ever produced output.
- Restarts/swaps: crash recovery resumed the engineer three times, then surfaced rather than switching a fourth time because the pinned override forbade replacement; the watchdog restarted the engineer once after 10m with no live process, and auto-surfaced the stuck task at 18:02:24Z to force the handoff through.

## What went wrong

- **Codex crash loop (16:48–16:58Z).** The engineer (then codex) exited with errors four times in ~10 minutes: one "Failed to write file …/tests/task-drawer-landable.test.ts" and repeated "Reading additional input from stdin...". Crash recovery resumed it three times, then surfaced the issue instead of switching agents — a human-set task override (codex + gpt-6-luna) was pinned, so RepoOS correctly refused to replace it. The human changed the override at 17:04:01Z and the cursor/composer-2.5 engineer carried the task from there. The write failure's root cause is not recorded.
- **Debugger dead on arrival.** All four debugger sessions failed instantly: DeepSeek-V4.1-Flash returned "You need positive balance to do inference" (no balance on the deepinfra account). Resolution was abandonment of the debugger role, not a provider fix.
- **Nudge/delivery churn.** Between 17:13 and 17:42Z the CTO nudger queued completion reminders every ~5m; queued messages sat undelivered, so turns were ended (exit code 143) solely to deliver them — several turn ends were delivery mechanics, not real handoffs. A `handoff_deferred` also occurred at 17:57:10Z because queued messages had to be read first.
- **Missed handoff signal.** The engineer's turn exited with code 0 without emitting `::repoos-handoff-ready::`; the watchdog auto-surfaced the stuck task at 18:02:24Z, after which handoff was requested via CLI and the gate ran (UI verification passed with a clean console).
- **Review pass 1 failure — mid-flight hotfix collision.** While the branch was open, main was hotfixed for the same bug (drawer/`completeTask` guards + `done-click-reason.test.ts`). Pass 1 found merge conflicts in `TaskDrawer.vue`/`repo.ts`, a dirty worktree (`agent-review.test.ts`), and a `needs some work` verdict. Round 2 merged main, adopted main's `reason?: unknown` guards in place of duplicate branch logic, committed the test reorder, and restored this task's `work/1119` frontmatter from the branch tip (main's copy was a held duplicate).
- **Flaky remote test.** A remote full-suite run failed `agent-review.test.ts` (~31s in) but reproduced as passing locally; diagnosed as a timing race where an async auto-bounce could flip task status before the land-anyway assertion. Fixed by reordering assertions (land-anyway POST before the follow-up POST). One later UI verification run reported 1 shot warning (auto shot captured Mission Control in a loading skeleton rather than the drawer); reviewers judged it acceptable for a tests-first fix.

## Learnings

- **Use `@click="handler()"` whenever the handler's first parameter is not the DOM event.** A bare `@click="handler"` silently injects the click `Event` as the first argument. This bit #1081's audit too, so it is a repeat class of bug — it belongs in `docs/agent-ui-and-preview-conventions.md` (and/or a line in AGENTS.md's Conventions) rather than only in this report.
- **Defend in depth:** a template-only fix was insufficient; runtime normalisation in `moveToDone` plus a server-side type guard means a future mis-binding fails with a clear message instead of a misleading 400.
- **Assert HTTP request bodies in component tests**, not just UI state — that is what would have caught this at the click-binding level.
- **When a hotfix lands on main while a branch is open, merge early and keep only the branch's true deltas** (here: server error-message test, drawer POST-body tests, audit notes). This cost a full review round.
- **Validator-timing tests should assert the deterministic action (land-anyway) before any async auto-bounce**, since loaded CI hosts flip statuses between assertions.
- The model-override pin is doing its job: crash recovery correctly surfaced instead of silently replacing a human-pinned agent/model pair — worth noting in `docs/` that a pinned override turns repeated crashes into a human decision point rather than an auto-swap.

## Follow-ups

None recorded.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
