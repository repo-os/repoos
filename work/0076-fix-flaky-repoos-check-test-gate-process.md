---
id: "0076"
title: "Fix flaky repoos check test gate: process-spawning tests time out under load"
type: bug
status: done
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/0076-fix-flaky-check-test-gate
created_at: "2026-08-11T05:13:52Z"
updated_at: "2026-08-11T06:03:38Z"
---
## Activity

- 2026-08-11T05:13:52Z · created · unknown

## Problem

`repoos check`'s **tests** step fails intermittently under load, then passes on
an immediate re-run. Observed 3x this cycle (#0063 twice, #0067 once): the
first `repoos check` after a build reported `✗ tests — Command failed: bun run
test`; running `bun run test` directly right after passed (113/112 tests), and
a second `repoos check` passed.

Cause: the vitest suite has process-spawning tests that poll with a hard 3s
`waitFor` timeout while real child processes start (or a fixture CLI script
runs):

- `src/ui-app/tests/agent-drivers.test.ts` — spawns fixture CLI stubs for
  qwen/codex and `waitFor(...)`s turn output/exits (3s default, e.g. lines
  132, 145, 209).
- `src/ui-app/tests/json-events.test.ts` — spawns `opencode` with fixture
  `PATH` and `waitFor`s spawns/exits (3s, lines 211-296).
- `src/ui-app/tests/models.test.ts` — runs `opencode models` probes with
  timeout-based waits.
- `src/ui-app/tests/detect.test.ts`, `git-worktree.test.ts` — shell out to
  git and the system PATH.

When the check gate runs right after a full build (`tsc` + vite), or while
other agents are concurrently building/checking in their worktrees, the system
is briefly saturated and a real spawn exceeds 3s → the poll throws → that test
file fails → `execSync("bun run test", { timeout: 120_000 })` in
`src/commands/check.ts:431` exits 1 → the whole gate fails.

Why it matters beyond annoyance: the **done flow** (`src/server/done.ts`
`CHECK_STEPS`) runs `repoos check` on main right after merging a branch. If the
flake fires there, the close-out returns `ok:false` with `merged: true` — the
branch is already merged but the task stays `review`, with the failure only
surfacing as a small feed line (the #0069 problem). And AGENTS.md requires a
green `repoos check` before a task can move to `review`, so a flake stalls
agents mid-loop. The gate must be trustworthy.

## Desired UX

- `repoos check` is deterministic: the tests step passes or fails for real
  reasons, never because a child process was 200ms slower than a hard-coded
  3s poll while the machine was busy.
- No change to what is tested — the suite still validates the same behavior.

## Acceptance criteria

- [ ] The process-spawning tests stop relying on short fixed `waitFor` polls
      for real spawned processes. Options (pick a coherent set, don't do all):
      - raise the poll timeout to a generous bound (e.g. 10-15s) with a fast
        poll interval so they still fail fast when truly broken;
      - make the fixture CLI stubs write output synchronously/instantly instead
        of simulating latency;
      - run the process-spawning files with an explicit longer vitest
        `testTimeout`/`hookTimeout`;
      - use vitest `pool: "forks"`/`maxWorkers` settings if default
        parallelism is the amplifier.
- [ ] The flake is reproducible before the fix: `for i in $(seq 1 10); do bun
      run test; done` (or a similar stress loop) fails at least once under
      load; after the fix the same loop is green 10/10.
- [ ] `repoos check` passes on a clean run AND immediately after a `bun run
      build`, and a stress re-check is stable.
- [ ] No behavior change to the tested code paths; fixtures still verify the
      same assertions.
- [ ] `repoos check` passes; zero new runtime dependencies.

## Notes for AI

- **This is a flake, not a failure.** Confirm the diagnosis first: run the
  suite directly (passes), then run `repoos check` (or a load loop) to see it
  trip. Do not "fix" it by removing tests or weakening assertions.
- **The gate is `execSync("bun run test", ...)` in `src/commands/check.ts:429-438`
  with a 120s timeout.** Do not change the gate's semantics; fix the suite's
  sensitivity. If a whole-suite retry is added instead, make it visible in the
  output (and document why) — but a retry should be a last resort, not the fix.
- **Fixture CLIs**: the tests use fake CLI scripts/fixtures under
  `src/ui-app/tests/fixtures/` (or inline). Making the stub finish
  deterministically-fast is the most robust fix; the polls then never race a
  slow machine.
- **Timeouts**: `waitFor` helpers live in each test file (e.g.
  `json-events.test.ts:211`, `agent-drivers.test.ts:102`) with a 3000ms
  default. Centralize/parameterize rather than one-off bumping.
- **Concurrency**: `repoos check` itself runs steps sequentially (staleness →
  build → tests → ui-smoke in `check.ts`), but multiple agents often run
  `repoos check`/builds in parallel worktrees, so the load is external too —
  the fix must tolerate a busy machine.
- **Don't**: don't delete or skip the flaky tests; don't weaken the assertions;
  don't change `check.ts`'s step ordering; don't raise `waitFor` defaults so
  high that genuinely-broken behavior takes 30s to surface (keep fail-fast
  intent); don't add a runtime dependency.
- Self-hosting note: this repo is RepoOS; the fix ships via `repoos check`
  itself, so after changing tests verify with the stress loop above, not just
  a single run.

## Related

- 0069 · visible mutation errors + done pre-flight (the close-out this flake
  can silently break — merged-but-still-review)
- 0047 · move-to-done flow (runs `repoos check` post-merge)
- 0075 · make move-to-done non-blocking (duplicate build/browser launches
  add load; complementary)

## Activity

- 2026-08-11T05:35:36Z · status ready→active
- 2026-08-11T05:55:13Z · status active→review
- 2026-08-11T06:03:38Z · status review→done
