## TL;DR

Task #1125 fixed a cluster of timing-sensitive tests (`remote-host-pool`, `agent-review`, `pressure-guard`, `agent-drivers`) that kept failing close-out and handoff on the remote runners (bee, thinkpad) even when the branch under review was correct. Root causes were environmental coupling in the tests: live CPU sampling blended into injected pressure probes, duplicated (too-short) wait budgets, unhandled queued-start results, and sleep-based shell-fixture synchronization. All four areas were fixed by removing the couplings (injected clocks/probes, shared wait helpers, file-marker gates, portable stale-mtime handling) rather than by raising timeouts. Production lock and pressure-guard behavior is unchanged apart from a narrow probe-only path in `pressureSnapshot`. One engineering round, one review pass (`good to go`), merged as `bbd4d3a7`.

## Outcome

The branch ships test-only stabilization with one narrow production change:

- **Pressure guard** (`src/core/pressure-guard.ts`): `pressureSnapshot` no longer appends live `sampleCpuIdlePercent()` when an explicit probe is supplied, so a fake memory probe owns the whole snapshot on loaded validators. `resetCpuIdleSampling()` is exported for tests, and sub-500ms polling is allowed only with an injected probe (the 500ms floor remains for real-machine waits). A regression test asserts relief snapshots stay null while a live CPU sample would read busy.
- **Agent review** (`src/ui-app/tests/agent-review.test.ts`): private 10s poll ceilings replaced with the shared 60s `WAIT_FOR_TIMEOUT_MS`/`WAIT_FOR_POLL_MS` helpers from `tests/helpers.ts`.
- **Agent drivers** (`src/ui-app/tests/agent-drivers.test.ts`): the resource-limits test now waits for `isQueued` to clear before reading spawn env, since `AgentRunner.start()` can return `{ ok: true, queued: true }` on a busy host.
- **Remote host pool** (`src/ui-app/tests/remote-host-pool.test.ts`): the deferred-queue test uses a `queue-ready` file marker (dropped only after dead and live wait entries exist) instead of a 200ms sleep; the orphan stale-break test uses `utimesSync` with a GNU/BSD touch fallback and a preflight mtime assertion, with the lock wait budget tightened to 15s. The holder/waiter case was already correct on main via `HOLDER_STARTED` (#1118).
- **Docs**: `docs/debugging-check-failures.md` extended with these tests, their causes, and the patterns to avoid (+28 lines).

No test was deleted, skipped, or made retry-on-fail. Final verdict: review pass 1 returned `good to go`; the task closed out successfully (gate completed in 588s) and was marked done with release status `success`, merged as commit `bbd4d3a7bdae5672b7d30d1475430ea43fefcd7b`.

## Process stats

- **Dev rounds:** 1 engineering round (Round 1, 2026-11-15T05:40:07Z, cursor / composer-2.5).
- **Review passes:** 1, verdict `good to go` (2026-11-15T05:40:46Z, cursor / composer-2.5) — no review-fix loop.
- **Wall-clock start → done:** 1h 26m 14s (created 2026-11-15T04:51:36Z, done 2026-11-15T06:17:50Z).
- **Close-out gate:** 588s.
- **Agents and models:**
  - Engineer: cursor / composer-2.5 — 2868s elapsed, 1000 tokens, cost 0.1234.
  - Reviewer: cursor / composer-2.5 — 37s elapsed; tokens and cost not recorded.
  - Debugger: opencode-go/deepseek-v4.1-flash — 5s elapsed; tokens and cost not recorded.
  - Routing: Model router (openrouter), model unknown — 1s elapsed.
- **Restarts or model swaps:** none recorded. A `cli_override` / `model_override` event was logged at task creation (04:51:40Z); its details are not in the record.
- **Token/cost totals:** only the engineer session has recorded values (1000 tokens, 0.1234); a fleet-wide total is not recorded.

## What went wrong

- **Repeated CTO nudges and interrupted engineer turns.** Between 05:21 and 05:36 the CTO monitor queued four completion reminders (5m without worktree activity). Three engineer turns (05:24, 05:29, 05:34) were ended specifically to deliver queued messages, each exiting with code 143; the first of these had produced no assistant message at all. Each delivery re-queued another nudge 5 minutes later. Resolved by ending turns so messages were delivered; the engineer eventually handed off at 05:40:07. The visible symptom in the log is "engineer turn ended without a handoff" three times, all caused by the nudge-delivery mechanism rather than by crashes.
- **Acceptance criterion not fully proven on remote hardware.** The 50×-under-load requirement on bee and thinkpad could not be executed from this session; verification was done locally (50× pressure relief, 20× lock trio, 25× engineer resource limits, plus concurrent vitest runs). The reviewer flagged the remote soak as the remaining AC gap and suggested one concurrent full gate on each remote runner after merge.
- **Stress-loop harness cut short.** The orphan stale-break stress loop with a background `yes` load generator was stopped by the environment time limit before printing a final count; sequential 20× batches of the lock trio completed with zero failures.
- **Prior fixes had not removed the flakiness.** Earlier attempts (#1101, #1102) left the failures in place; #1120 had failed three consecutive close-outs, #1123 and #1122 once each, and #1120/#1122 failed handoff checks, at a cost of 15–20 minutes per failure. This task is the fix that stuck.
- No failed gates, flaky checks, or crashes occurred during this task's own close-out: the gate completed in 588s on the first attempt and the review passed on the first pass.

## Learnings

Worth carrying forward (the first four are now recorded in `docs/debugging-check-failures.md` by this change; no AGENTS.md or ADR addition is indicated by the record):

- **Injected probes must own the whole snapshot.** Mixing any live host signal (CPU idle, paging) into a fake memory probe recreates "fails on loaded validator, passes in isolation." Fixed in `src/core/pressure-guard.ts`.
- **Do not duplicate wait budgets.** A local 10s poll inside a file that imports 60s shared helpers fails first under load and wastes close-out time; poll ceilings and intervals should come from `tests/helpers.ts`.
- **`ok: true` ≠ spawned.** `AgentRunner.start()` can return a queued result; tests reading spawn env must wait for `isQueued` to clear, the same polling discipline used for subprocess logs.
- **Shell tests need explicit gates, not sleeps.** File markers (`queue-ready`, `HOLDER_STARTED`) tie correctness to fixture state rather than machine speed; fixed sleeps are not synchronization primitives. Related conventions already live in `docs/agent-debugging-and-incidents.md` (#0521/#1101/#1118 lineage).
- **Close-out costs of flaky tests compound:** a green-review branch can fail close-out repeatedly with nothing wrong in its diff — the diagnosis ("fails identically on two hosts is real until proven otherwise") from AGENTS.md held here, and the root causes were all in test/environment coupling, not in production code.

## Follow-ups

None filed — the Linked tasks record for #1125 is empty. The reviewer's suggestion (run one concurrent full gate on bee and thinkpad after merge to close acceptance criterion 3 without another close-out surprise) remains outstanding as a post-merge validation step; if the human wants it tracked, it should be filed as a new task, since no task id covers it in the record.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
