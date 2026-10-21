---
id: "0900"
title: "Tests that start engineers fail on runners whose swap is over the pressure guard limit: isolate tests from host memory pressure"
type: feature
status: active
priority: p1
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/tests-that-start-engineers-fail-on-runne
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-21T14:05:10Z"
updated_at: "2026-10-21T14:05:36Z"
---
## Problem
Remote validation fails persistently on spawn-related tests (tests/agent-review.test.ts auto-bounce/exhausted-rounds, tests/agent-concurrency.test.ts queue/double-start, agent-drivers qwen 'on thinkpad'). 2026-10-21: #0894 failed its handoff gate on these, #0895 failed twice (13:27Z and 13:59Z), #0874 failed once on mini; the same tests also fail on main on the laptop under load (agent-review 'timed out waiting for engineer resumed with auto-bounce findings'). Root cause found: the memory-pressure guard (#0871, pressureGuard.maxSwapUsedRatio=0.5) reads the HOST's swap, and the tests start real engineer spawns through the server. Runner swap at diagnosis time: thinkpad 3012/4095 MB (73%), mini 1027/2048 MB (50.1%), bee 428/4095 MB (10%). Over the limit the guard holds new engineer starts, so the tests' expected spawn never happens. Because fallbackToLocal=true, close-outs then silently re-run the whole gate on the laptop (slow, high load) - the 'Ran locally' events and 20+ minute close-outs.

## Desired UX
Gate results do not depend on the runner's or laptop's memory state. Unit/integration tests of spawn behaviour run with the pressure guard disabled or fed a fixed healthy sample. The pressure guard itself keeps its own dedicated tests with injected samples. A remote failure caused by the guard is never reported as a test failure of the branch.

## Acceptance criteria
- Test fixtures that start engineers (agent-review, agent-concurrency, agent-drivers, and any other that calls /start) set pressureGuard.enabled=false or inject a healthy sample; verified by running them with a stub reporting 90% swap used.
- A test proves the suite is green when the host reports swap 73% and compressor 40%.
- Add a guard-focused test that still covers blocked/unblocked transitions with injected samples.
- Document in docs/debugging-check-failures.md: runner swap over 50% held engineer starts and caused false remote failures; how to spot it (queue marker kind pressure) and the swap check.

## Notes for AI
Look at src/core/pressure-guard.ts, resource-limits.ts and the test helpers (makeFixture/withServer in src/ui-app/tests). Do not lower the guard's production thresholds. Also consider logging the guard verdict in the gate output when it holds a start.

## Activity

- 2026-10-21T14:05:10Z · created · njachowski@gmail.com
- 2026-10-21T14:05:31Z · status inbox→ready
- 2026-10-21T14:05:35Z · cli_override, model_override
- 2026-10-21T14:05:36Z · status ready→active, branch
