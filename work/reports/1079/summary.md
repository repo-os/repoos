## TL;DR

The server now contains expected process-signal and transient network rejections, stops cleanup promptly when a process group cannot be signalled, and surfaces a crash notice after restart. Final review verdict: **good to go**.

## Outcome

The change addresses the incident where a failed `kill()` could crash the RepoOS control-plane server. Cleanup now handles `EPERM` and `ESRCH`, process-level rejection handling keeps known recoverable errors from taking down the server, and fatal exits leave a marker that the next startup turns into a dashboard attention notice. Managed services already restart on failure through their OS supervisor.

The incident is documented in `docs/agent-debugging-and-incidents.md`. The final review approved the change, and close-out completed successfully.

## Process stats

- Development rounds: 2.
- Review passes: 2 — first verdict “needs some work,” second “good to go.”
- Wall-clock from task creation to done: 2026-11-09T11:20:50Z to 2026-11-12T14:17:29Z; elapsed duration not recorded.
- Engineer: 1 session, Codex / gpt-6-luna; 4,399 seconds elapsed and 43,674,218 tokens recorded. Cost not recorded.
- Reviewer: 2 sessions, Cursor / composer-2.5; elapsed times 45 seconds and 52 seconds. Tokens and costs not recorded.
- Routing: 2 sessions, Model router (openrouter) / typesafe/jev-1.14-20261014; 2,031 and 2,425 tokens recorded. Costs not recorded.
- Close-out gate: completed in 592 seconds.

## What went wrong

- The first implementation contained `EPERM` from the signal call, but cleanup could still poll forever because the liveness probe treated `EPERM` as “alive.” The first review also found that fatal-marker writing and startup recovery used different paths. The engineer corrected both, added regression coverage for signal and probe failures, and shared the marker-path helper.
- The first review found missing tests for the actual injected `unhandledRejection` handler and the attention notice. The next round added handler and notification coverage.
- The first engineering report recorded a formatting failure and earlier check infrastructure/timing issues; formatting was fixed and the final check passed. A remote validation upload did not complete, so the scoped check ran locally. An earlier check attempt had infrastructure and timing failures; the final selected check steps were green.
- The original incident log was absent from the worktree, so the precise production caller could not be confirmed. The shared process-group cleanup path was reproduced and tested directly.

## Learnings

- Signal denial must be handled consistently in both the signal call and liveness probe; otherwise cleanup can wait indefinitely. The process-group tests and incident note capture this.
- Recoverable rejection handling should be narrow, with unknown errors retaining fatal behavior. Tests should exercise the registered process event handler, not just its classifier.
- Restart ownership belongs to the process supervisor. Managed services restart on failure; foreground launches need an external supervisor. The next-boot notice reports the crash when the server returns.
- Review noted that treating a denied liveness probe as “not alive” can leave orphaned processes, and some cleanup paths may lack task context. These are documented review observations, not filed follow-ups.

## Follow-ups

None recorded.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
