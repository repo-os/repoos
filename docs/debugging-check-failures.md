# Debugging `repoos check` failures

Written 2026-09-13, consolidating incidents from 2026-08-15 → 2026-09-03.

`repoos check` failing on a task whose diff couldn't plausibly have caused it is
one of the most common time sinks in this repo. This is the triage order, and
the incidents that taught it.

## The decision rule

**If it reproduces in isolation on an idle machine, it is a real bug. Debug it
as one.** Resource-pressure flakes do not reproduce on a quiet box.

Two corollaries that have each cost days here:

- **Run the whole suite, not just the first failing file.** One root cause
  routinely breaks several suites at once; the first failure is rarely the most
  informative one.
- **Be suspicious of exact-count assertions against streamed agent output**
  (`lines.length === 3`, `expect(lines).toEqual([...])`). Any change to what the
  agent driver emits per turn breaks these, and the failure presents as a
  timeout rather than an assertion error.

Only after that rules out a real bug should you reach for the flake explanation
below.

## The genuine flake: memory pressure

Many server and integration tests spawn real child processes (fake `opencode`
CLI stubs, `git`) and poll with `waitFor`. When the machine is under memory
pressure — swap near full, heavy `compressor` — a subprocess launch that
normally takes ~200ms takes >15s, and those tests hit `testTimeout`.

Observed 2026-08-27: `agent-review.test.ts` failed 9/9 with pure timeouts even
run alone on pristine `main`; the full suite failed 18 tests, 17 of them
timeouts. Swap was 14.3G/15.4G used, ~80M RAM free. Confirmed not a regression
by running the same files in isolation against untouched `main`.

In a task's Activity log this looks like: repeated `handoff failed · check
failed after 2 automatic retries` citing tests the diff never touched
(watchdog, agent-review, done-reliability, boot-timing…), then `watchdog:
auto-surfaced stuck task · status active→review`. Each loop looks like a new
review round — `review_passes` climbs — but it's the same unfinished handoff.

What helps: free memory and re-run; run in small batches. The config already
mitigates with `testTimeout: 15_000` and a conservative `maxWorkers` floor.
Running under Bun (the default) cut the full suite 403s→~82s with no flakes,
largely because its lower RSS leaves headroom — so a Node-pinned run is more
exposed to this than a Bun one.

## Counter-example: when it looked identical but wasn't

2026-09-03, v0.5.36 release cuts kept failing with `agent-drivers.test.ts >
qwen code driver … Test timed out in 30000ms`. Diagnosed at first as the
memory-pressure flake. **That was wrong, and the misdiagnosis persisted for
days.**

It was a deterministic regression: `ead7245f` (route skills per task run) added
a leading `Skill routing: …` line to *every* agent turn, including "no skills
selected". That shifted the output-entry shape and broke exact assertions in
three suites — `agent-drivers.test.ts` (a `lines.length === 3` check that
manifested as a 30s hang), `json-events.test.ts`, and
`session-persistence.test.ts`. It had been failing every `repoos check` since
2026-09-01.

Fixed in `06e24987` by emitting the sys line only when a skill is actually
injected, plus exporting `selectSkillsForRun` and adding `skill-routing.test.ts`
— the feature had **zero** test coverage, which is why it read as a flake
rather than a regression.

## Related: it can also be a runtime difference

"Passes for me, fails in the pipeline" is a version or runtime difference far
more often than it is flakiness. Two incidents in AGENTS.md's *"Debugging:
search the error, then check the versions"* section cover this in detail — a
Node 24 vs Node 26 `localStorage` divergence, and a `bun run test` path that
silently ran under Node. Check which runtime each path actually uses before
concluding anything.

## Other fixed causes worth recognizing

- **Internal `waitFor` deadlines separate from `testTimeout`.**
  `pending-handoff.test.ts` had a hard 3s deadline around real child-process
  spawn/exit, independent of the 15s `testTimeout`; it blocked a release cut
  until widened to 10s (`60437b33`).
- **Leaked test fixtures.** ~17,850 orphaned `<fixture>-worktrees` directories
  had accumulated in `$TMPDIR` because `reapStaleFixtures` only removed a
  fixture's `-worktrees` sibling as a rider on its primary directory, while
  worktree tests' `clean()` did a bare `rmSync(root)`. Fixed in `2c48b5ae`;
  every `bun run test` now runs a global reap that **warns when it removes >50
  in one run** — that warning is how a new leak becomes visible, so don't
  ignore it.
- **Nothing enforced formatting before `665f6289`**, so source drifted while
  `dist/` built fine. `fmt:check` + `lint` are now part of the gate.

## The structural fix: Remote Validation Runner

When `[remoteValidation] enabled`, the close-out gate runs `bun install`,
`bun run build` and `bun run test` on a disposable Hetzner VM (created from a
snapshot, deleted on idle), and the local `repoos check` runs guards and the UI
smoke test only via `REPOOS_SKIP_TESTS=1`. Hooked into `validateCandidate`
(integration-orchestrator.ts) and `completeTask` (done.ts). Infrastructure
failure is retryable unless `remoteValidation.fallbackToLocal`.

Off by default; needs `HETZNER_API_TOKEN` and `REPOOS_REMOTE_SSH_KEY` plus a
prebuilt snapshot. See `remote-validation.md`.
