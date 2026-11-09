## TL;DR
Remote browser captures now exit after publishing results, can be collected while their containers still run, and are reaped or cancelled with observable outcomes. Final review verdict: **good to go**; merged as `04b38076a831e1c0c6054706630b5b8d6022f25e`.

## Outcome
Shipped a Tailscale capture lifecycle fix: the runner performs bounded cleanup and exits explicitly; the Mac collector can collect a stable `result.json` without waiting for container exit; completed idle captures can be reaped; and failed handoffs cancel that task’s queued and running captures. Removal and reaping outcomes are surfaced for operators. Automated tests and script checks cover these paths. Physical runner behavior was not exercised.

## Process stats
- Development rounds: 11. Review passes: 15.
- Wall-clock from task creation to completion: 21h 14m 28s.
- Engineer: gpt-6.1-terra and composer-2.5; three recorded sessions, with restarts/swaps reflected in the activity log. Token totals: 62,421,656 and 101,897,407 for the two gpt-6.1-terra sessions; 0 recorded for composer-2.5. Cost: not recorded.
- Reviewers: gpt-6.1-terra, gpt-6-luna, and default-model sessions. Reviewer token totals recorded: 234,460, 780,929, and 760,046; other sessions’ tokens and all costs: not recorded.
- Other agents: debugger sessions using default model; tokens and costs: not recorded.

## What went wrong
- Several engineer turns ended without requesting handoff, and multiple handoffs were deferred by queued messages or failed because formatting was dirty, the worktree changed during checks, or engineering report sections were missing. Formatting was fixed and checks rerun; the worktree was stabilized before later handoffs.
- Repeated reviews found real gaps in provider coverage, reaper scheduling and visibility, startup-script error handling, and truthful Docker removal reporting. These were addressed through follow-up implementation and regression coverage.
- One reviewer run failed with a protocol/network timeout. Cursor sessions also failed from stalled connections, DNS errors, and a weekly usage limit; watchdog restarts and an adopted engineer process kept work moving.
- One scoped check run had four host-pressure timing failures; an immediate rerun passed. The final review found no bugs, and the close-out gate completed successfully.

## Learnings
Treat stable result artifacts as the completion signal for remote captures; process exit alone can hang. Reaping must verify completion, quiet output, and low CPU immediately before removal, and report success only after confirmed removal. Failed handoffs need to cancel both queued and active captures. Keep the related operational guidance in [docs/remote-validation.md](docs/remote-validation.md); the broader Docker/SSH failure variants and non-Tailscale parity are tracked separately.

## Follow-ups
#1068 — track remaining Docker and SSH failure-handling variants and non-Tailscale provider parity.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
