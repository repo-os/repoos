/**
 * Drop `REPOOS_CHECK_CHANGED` from every test worker's environment.
 *
 * The server's handoff finalization runs `repoos check` with
 * `REPOOS_CHECK_CHANGED=<merge-base>` (src/server/handoff.ts) to scope the gate
 * to the branch's changes. The scoping itself reaches vitest as `--changed`
 * args (scripts/run-tests.mjs), so no test needs the variable — but tests that
 * spawn their own `repoos check` inside a throwaway fixture repo (e.g.
 * mtd-docs-fast-path's bootstrap case) inherited it, and failed with
 * `"<sha>" is not a commit, branch or tag here`. Deterministic, and only on
 * handoffs whose scoped run happened to pull those suites in (#0499, which
 * touched src/core/config.ts).
 */
delete process.env.REPOOS_CHECK_CHANGED;

/**
 * Likewise drop the check-history routing vars the server exports to gates
 * (release.ts, handoff.ts, integration-orchestrator.ts). With
 * `REPOOS_CHECK_STORE_ROOT` inherited, a test's `runCheck(..., fixtureRoot)`
 * wrote its row into the REAL repo's `.repoos/checks.db` and then found its own
 * fixture store empty — deterministic failure only inside a gate (#0607), plus
 * fake "skipped" rows polluting the real history.
 */
delete process.env.REPOOS_CHECK_STORE_ROOT;
delete process.env.REPOOS_CHECK_PHASE;
delete process.env.REPOOS_TASK_ID;
