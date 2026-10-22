# Debugging `repoos check` failures

Written 2026-09-13, consolidating incidents from 2026-08-15 → 2026-09-03.

## Reviewer sandbox cannot run landing checks (#0910)

The review prompt includes the server-computed `repoos landable` checklist for
the reviewed commit. Reviewers must rely on those facts rather than executing
`repoos landable` or `git merge-tree --write-tree` from their sandbox. If the
sandbox cannot reach the RepoOS server, create a temporary git file, or run a
tool, record that under `Could not verify (environment)`. Environment-only
reports with no code findings do not change the verdict and do not consume
review rounds. If the server checklist itself reports a failure, that is a real
landing gate and must be handled from the named check.

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

## The pressure guard held the starts (#0891, #0900)

A distinct, worse version of the memory-pressure flake: the **host pressure
guard** (`src/core/pressure-guard.ts`, `pressureGuard.maxSwapUsedRatio = 0.5`,
`maxCompressorRatio = 0.35`) samples the machine before every new engineer
start. Over the limit, `AgentRunner.spawnOrQueue` defers the turn — it returns
`queued: true` with reason `pressure` and never spawns. Tests that start real
engineers through the server then sit on a `waitFor` that can never succeed and
report a timeout. The branch is fine; the runner's swap was not.

Observed 2026-10-21: #0894 failed its handoff gate on these tests, #0895 failed
twice, #0874 failed once on mini. Runner swap at diagnosis: **thinkpad 3012/4095
MB (73%)**, **mini 1027/2048 MB (50.1%)**, bee 428/4095 MB (10%). The same
files passed on an idle laptop. With `remoteValidation.fallbackToLocal`, the
close-out silently re-ran the whole gate locally, which is why those runs showed
**"Ran locally"** events and took 20+ minutes.

**How to spot it**

- The task's queue marker: `.repoos/queue-markers/<taskId>-pressure.json` with
  `"kind": "pressure"` (the same marker the UI shows as a held start). A
  `local-check`/`playwright` marker is the other kind and means a gate/browser
  slot, not an engineer start.
- `agent.queued` events with `reason: "pressure"` in the task log, and a system
  log line `Pressure guard held an engineer start` with the reason.
- The failure names spawn-heavy tests (`agent-review` auto-bounce/exhausted
  rounds, `agent-concurrency` queue/double-start, `agent-drivers` qwen
  "on thinkpad") while the diff touches none of them.

**Check the runner's swap — do not read it off the test failure**

```sh
# macOS: swap used/total plus the compressor pool
sysctl vm.swapusage
vm_stat | grep -i 'Pages occupied by compressor'
memory_pressure | grep -i 'free percentage'

# Linux: swap used = SwapTotal - SwapFree
grep -E '^(SwapTotal|SwapFree):' /proc/meminfo
```

If swap is at/over 50% of total or the compressor holds ≥35% of RAM, the guard
is doing its job. **Never lower the production thresholds to make a test pass**;
that risks the machine for a green build.

**What keeps it from recurring:** fixtures that start engineers or review turns
set `[pressureGuard]\nenabled = false` in their `repoos.toml` (or pass
`pressureGuard: { enabled: false }` to a directly-constructed `AgentRunner`), so
spawn assertions measure the code, not the host. The guard's own suite injects
samples (`pressure-guard.test.ts`, `agent-pressure-guard.test.ts`), and
`agent-start-host-pressure.test.ts` proves a spawn still happens with an
injected swap-73%/compressor-40% reading while the fixture has the guard off.
Production keeps the guard on: this is a test-isolation rule, not a reason to
weaken it.

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

## Browser-capture env leaking into gate tests (#0905)

When browser steps or capture are offloaded (`remoteValidation.offloadBrowserSteps`,
`browserCaptureMode = runner-only`), the remote runner's `validate.sh` passes
`REPOOS_OFFLOAD_BROWSER_STEPS=1` and the `REPOOS_BROWSER_CAPTURE_*` variables
into the `repoos-ci` container. It also sets `REPOOS_ROOT=/repo`. All of these
describe the **runner**, not the fixture repo a test creates, and a test that
spawns `repoos check` inherits them.

The failure looks like a behaviour change, not a code assertion: a suite that
drives the managed engineer check takes a different branch and prints the
*unmanaged* warning — `uncommitted changes (...) — the remote gate tests
committed HEAD only` — instead of the `could not commit a WIP checkpoint` line
it asserts on. `REPOOS_ROOT=/repo` alone does the same thing by making the
fixture's task id look foreign (#0870), dropping the run's attribution. A test
that used to exit at a warning may instead run the whole local gate and time
out, which reads like a hang.

Recognition:

- It passes in isolation and on an idle local box, and fails only in the remote
  gate (or only when the capture policy is switched to runner-only).
- Re-running the file with the runner's env reproduces it deterministically:

  ```bash
  REPOOS_OFFLOAD_BROWSER_STEPS=1 REPOOS_BROWSER_CAPTURE_MODE=shots \
    bunx vitest run --config src/ui-app/vite.config.ts \
    src/ui-app/tests/check-remote-wip.test.ts
  ```

- Clearing the variables (`env -u REPOOS_OFFLOAD_BROWSER_STEPS -u
  REPOOS_BROWSER_CAPTURE_MODE ...`) makes it pass, with no source change.

The fix is in the test worker setup, not in `validate.sh`: `check-env.ts`
clears `VALIDATE_INJECTED_ENV_KEYS` (`tests/setup/validate-injected-env.ts`)
once for every file, and `validate-env-isolation.test.ts` fails when
`validate.sh` gains a `-e REPOOS_*` line that is not in that list. A test that
deliberately exercises the managed check still saves, clears and restores the
set around its own run (`check-remote-wip.test.ts`) so the result is independent
of the caller's environment. Do not treat "passes in isolation in the runner
container" as proof — run it with the offload variables set.

## Related: it can also be a runtime difference

"Passes for me, fails in the pipeline" is a version or runtime difference far
more often than it is flakiness. Two incidents in AGENTS.md's *"Debugging:
search the error, then check the versions"* section cover this in detail — a
Node 24 vs Node 26 `localStorage` divergence, and a `bun run test` path that
silently ran under Node. Check which runtime each path actually uses before
concluding anything.

## Other fixed causes worth recognizing

- **The host pressure guard leaking into an agent test (#0891).** `AgentRunner`
  defers every `start()` while `pressureReason(config)` is non-null, so a test
  whose fixture config leaves `pressureGuard` at its default measures the
  runner's host memory/load rather than the behaviour under test. On a loaded
  runner the first start is queued as `pressure`, a concurrency test's
  `r1.queued`/`isRunning` assertions fail, and every later `waitFor` times out.
  Tests that spawn agents set `pressureGuard: { enabled: false }` unless the
  guard is the subject; `agent-pressure-guard.test.ts` covers the guard itself.
  The same fixtures should hold a fake CLI open until the test releases it (a
  SIGTERM handler that exits cleanly) instead of letting it self-exit: a drain
  assertion must depend on an explicit exit event, never on how fast a spawned
  process finished.
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
  A later warning (74 dirs, #0858) traced to files that never cleaned their own
  fixture roots at all — `built-in-agents.test.ts` alone created one
  `repoos-techdebt-*` per test. Each test file now gets its own tmpdir under a
  per-run root (`src/ui-app/tests/setup/tmp-isolation.ts`), which is removed
  both at the end of the file and in `global-reap`'s teardown after every
  worker exits, so the warning should only fire after a crashed or killed
  worker.
- **Nothing enforced formatting before `665f6289`**, so source drifted while
  `dist/` built fine. `fmt:check` + `lint` are now part of the gate.

## Misread as a check flake: output-health kills (#0709, #0718)

During a long agent-driven run, engineers can die mid-turn while handoff or
watchdog activity still cites **unrelated** gate failures. A separate failure
mode is **`needs_input` · provider-failure** (or **degenerate output**) where the
detail is a **random stream-json line** and **stderr is empty** — healthy agents
killed because output health substring-matched tool output or timestamps (#0709),
or scanned tool payloads as assistant text (#0718). That looks like a provider
outage or a silent harness bug; it is **not** a `repoos check` regression and
does not reproduce as a failing test on an idle machine.

Current rules: `scrapeProviderFailure` only inspects structured error fields on
JSON events and short plain lines; the degenerate tracker only scores assistant
text blocks. Recognition, CLI steps, and overnight incident context:
[`agent-run-operations.md`](agent-run-operations.md#false-provider-or-credit-kills-0709-0718).

## The structural fix: Remote Validation Runner

When `[remoteValidation] enabled`, the close-out gate runs `bun install`,
`bun run build` and `bun run test` on a disposable Hetzner VM (created from a
snapshot, deleted on idle), and the local `repoos check` runs guards and the UI
smoke test only via `REPOOS_SKIP_TESTS=1`. Hooked into `validateCandidate`
(integration-orchestrator.ts) and `completeTask` (done.ts). Infrastructure
failure is retryable unless `remoteValidation.fallbackToLocal`.

Off by default; needs `HETZNER_API_TOKEN` and `REPOOS_REMOTE_SSH_KEY` plus a
prebuilt snapshot. See `remote-validation.md`.
