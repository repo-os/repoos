---
id: "0737"
title: Repair repeated review handoff race exposed by pre-release coverage
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/repair-repeated-review-handoff-race-expo
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-07T10:16:47Z"
updated_at: "2026-10-07T14:15:42Z"
review_passes: 1
last_check_failure: "repoos check at 2026-10-07T12:21:44.677Z: server-side finalization timed out (deadline exceeded)"
dev_error_count: 1
---
## Problem
Current main 541f9b3c78567799f5d0f5b5b44cfef7f9babf8b, compiled version0.5.67 hashfb4bf9051342bd324397256c375a881b7621b9ccf675853ab448e140f7e9465c. Pre-release bun run test:coverage failed agent-review.test.ts:361 second requestReview after human PATCH active: expected202 got200. Isolated single-worker reproduction also failed expected202 got409. Evidence /private/tmp/repoos-pre-release-coverage.log and /private/tmp/repoos-review-reproduction.log. Do not assume a flake or broaden timeouts.

## Desired UX
A completed review returned to active may request another handoff reliably. Capture HTTP response bodies and task/index/runner/finalization state to determine whether this is a product lifecycle race or a test awaiting the wrong completion boundary. Preserve the actual diagnosis and fix the responsible boundary.

## Acceptance criteria
Deterministic regression covers the identified race; focused real server lifecycle test passes with same HEAD across repeated reviews, no duplicate reviewer and no premature status transition. If only the fixture synchronization is wrong, fix that synchronization with a meaningful completion condition, not sleeps/retries masking an actual failure. Build and scoped check once, full handoff then independent review.

## Notes for AI
Read AGENTS.md. Use existing task worktree, Cursor/composer-2.5. Independently verify diagnosis on current main and running build before implementation; external reports may be stale, record commit/version/repro and relevance. Inspect routes/tasks.ts patchTask, server.ts startUnifiedHandoff, agent-review test requestReview/waitForReviewRunning. Do not edit main or other task worktrees, config, hosts, releases, or restart server. No hand edits work/*.md. Do not weaken lifecycle/check guards or merely accept200/409. If conflicts with #0724/#0728 arise preserve both feature sets. One scoped check after building, handoff once then end turn.

## Reproduction and evidence (2026-10-07, driver)

The first fix (waitForHandoffSlotReleased in the test) is NOT sufficient. Evidence:

- Deterministic locally: `bunx vitest run --config src/ui-app/vite.config.ts agent-review -t "reviews again after a human returns"` fails 3/3 on this branch AND on main with `AssertionError: expected 200 to be 202` at the second `requestReview` (tests/agent-review.test.ts ~line 215, after the human `PATCH status: active`).
- On a remote runner (bee, full suite, 2026-10-07 13:17Z) the same test failed differently: `timed out waiting for #0001 to reach review (status=active, pendingHandoff=false)`.
- Lead: src/server/routes/tasks.ts ~line 837 `if (body.status === "review" && prevStatus !== "review")` returns 202 with pendingHandoff. A 200 means `existing.status` was ALREADY `review` when the second PATCH arrived, i.e. the task was `review` again (or the index still said `review`) after the human's `PATCH status: active` returned 200. Find who writes `review` (the watcher/interceptor, a late finalization, the reviewer, or a stale index snapshot) and make the lifecycle deterministic. This is likely a PRODUCT race (a return-to-active followed by a new handoff request), not only a test wait.
- Also note: the run on bee finished its gate with exit 1 and then the container stayed up for ~11 min, so the hang detector (#0729) killed it as 'hung' and retried on another host, hiding the real test failure. Do not fix that here; file a follow-up if confirmed.

Done means: that test passes 10 times in a row locally under load, and the server behaviour is explained in the task notes.

## Activity

- 2026-10-07T10:16:47Z · created · unknown
- 2026-10-07T10:17:09Z · cli_override, model_override
- 2026-10-07T10:18:04Z · status inbox→ready
- 2026-10-07T10:18:13Z · status ready→active, branch
- 2026-10-07T10:36:24Z · body
- 2026-10-07T10:38:48Z · body
- 2026-10-07T10:52:31Z · body
- 2026-10-07T11:00:30Z · note: Release blocker evidence10:55: #0730 post-conflict fullhandoff failed same repeated-review requestReview test215 expected202got200 on thinkpad, 5235 other tests passed. Please prioritize deterministic fix and handoff after build/scopedcheck; do not broaden into unrelated suite failures or retry fullpassingremotechecks for local-only failures. Driver holds #0730 identical gate retries pending your landing. Preserve actual200/409 response-body diagnosis and no duplicate-review semantics.
- 2026-10-07T11:03:31Z · body
- 2026-10-07T11:05:05Z · body
- 2026-10-07T11:26:54Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-07T11:43:40Z · agent exited with an error (cursor) · Error: [unavailable] read ETIMEDOUT
- 2026-10-07T11:58:20Z · needs_input
- 2026-10-07T12:02:39Z · body
- 2026-10-07T12:04:31Z · body
- 2026-10-07T12:43:46Z · body
- 2026-10-07T12:44:12Z · status active→review
- 2026-10-07T12:44:13Z · status review→active
- 2026-10-07T12:49:35Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-07T12:49:35Z · status review→active
- 2026-10-07T12:54:44Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —     228|   expect(res.status).toBe(202);
       |                      ^
    229|   expect(res.body.status).toBe("active");
    230|   const deadline = Date.now() + 30_000;
 ❯ tests/agent-review.test.ts:375:13
 ❯ withServer tests/agent-review.test.ts:295:11
 ❯ tests/agent-review.test.ts:366:11
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 429 passed | 1 skipped (431)
      Tests  1 failed | 5216 passed | 15 skipped (5232)
   Start at  12:50:12
   Duration  267.76s (transform 6.52s, setup 2.32s, import 49.69s, tests 220.48s, environment 236.96s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 417ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  12:54:41
   Duration  2.25s (transform 1.03s, setup 11ms, import 1.29s, tests 417ms, environment 463ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T13:00:35Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-07T13:00:35Z · status review→active
- 2026-10-07T13:06:15Z · status active→review
- 2026-10-07T13:06:16Z · note: shots: skipped — the diff (2 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-07T13:07:25Z · note: review pass 1: good to go
- 2026-10-07T14:02:24Z · body
- 2026-10-07T14:02:24Z · status review→active
- 2026-10-07T14:11:46Z · note: Driver latest release-blocker evidence14:07:56: #730 fullhandoff failed on bee after301s, tests/agent-review.test.ts reviews again after human returns to engineering; gate exit1 is real product/test failure. Current automatic fallbackmini remainslive; no driver identicalretry. Existing owner acceptance10 consecutive localpasses underload remains required. Verify first/secondresponse bodies, on-diskstatus and index around PATCHactive and requestReview; do not weaken snapshot guards. #739 owns false-hung/slotcleanup separate scope.
- 2026-10-07T14:15:31Z · note: Independent driver baseline at14:13:46 current MAIN: bunx vitest run tests/agent-review.test.ts -t reviews-again (full phrase) --maxWorkers=1 PASSED once in6.04s, log /private/tmp/repoos-driver-0737-current-repro.log. Earlier sandbox attempt EPERM bind was harness permissions, excluded. This does not invalidate owner3/3 or repeated realgatefailures; race depends on interleaving/load. Require deterministic delayed-watcher/finalization regression plus owner10passesunderload, no passing-once releaseclaim. Running engineer stilllive, no driver sourceedit.
- 2026-10-07T14:15:42Z · body
