---
id: "0330"
title: "boot-timing.test.ts: deterministic ordering check (index-build-delay injection or listen()-first restructure)"
type: feature
status: inbox
priority: p3
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-05T05:50:51Z"
updated_at: "2026-09-05T05:50:51Z"
---
`boot-timing.test.ts` (#0271 regression guard) can no longer reliably prove
"listener binds before the index-populated promise resolves" at its current
fixture size. Confirmed empirically 2026-09-05, deterministic, not flaky:

- `bunx vitest run` (executes under Node): 5/5 passed a state check
  (`index.snapshot().taskCount === 0` sampled at the instant `listen()`'s
  callback fires).
- `bun run --bun vitest` (forced Bun — this project's own default runtime,
  see `bun-runtime-optin` memory/docs): 2/2 FAILED the same check —
  `taskCount` was already 20 (the full fixture) by the time `listen()` fired.

Root cause: `startServer()` (`src/server/server.ts`) kicks off
`index.refreshAllAsync()` then has ~23 unrelated `await`s before it reaches
`bindOnce()`/`listen()`. Under Bun, this fixture's 20-task index build
(Bun.spawn-backed git subprocess enrichment) reliably completes in ~3s —
faster than those 23 intervening awaits — so the async build wins the race
and finishes before `listen()` is even called. That's NOT a regression (the
build still runs concurrently, it's just fast); it just means a small/cheap
fixture can't deterministically distinguish "correct async" from "regressed
to synchronous" once the async work is fast enough to win either way.

Three prior formulations were tried and reverted (see the test file's header
comment for the full history: HTTP-timed numeric comparison, HTTP-timed
boolean comparison, in-process timing/state comparison) — all either flake
under desktop load or fail deterministically under Bun. The test currently
just checks the server comes up within a generous ceiling and reports the
right task count — weaker than the original ordering guarantee, but honest.

## Real fix options (pick one)

1. **Deterministic delay injection** — give `LiveIndex`/`buildIndexAsync` (or
   `startServer`'s options) a test-only seam to inject an artificial delay
   into the async build, so the race has a guaranteed winner independent of
   runtime speed, OS caching, or hardware. Cleanest, but touches
   production code paths (even if only to add an optional override).
2. **Restructure `startServer` to call `listen()` immediately** after kicking
   off `refreshAllAsync()`, with zero intervening `await`s — makes the
   ordering a structural guarantee (synchronous call order) rather than a
   race, no test changes needed at all. Bigger, riskier change: the ~23
   awaits between them likely do real setup (auth config, route wiring, port
   resolution) that may need to move to run concurrently with or after
   `listen()` instead of before it — needs careful review of what actually
   must happen before the port opens vs what's safe to defer.

Either way, re-verify under BOTH `bunx vitest run` (Node) and `bun run --bun
vitest` (Bun) before calling it done — this bug only manifests on the fast
runtime, and testing on Node alone would ship it broken again.

## Why (context)

Came out of a 2026-09-03/04/05 session investigating `repoos check`
flakiness generally (skill-routing regression, tmpdir `-worktrees` leak,
release-page redesign) — this specific test was tightened as a "hotfix" for
its known network-timing flake, which surfaced this deeper, pre-existing
runtime-speed race in the process.

## Activity

- 2026-09-05T05:50:51Z · created · unknown
