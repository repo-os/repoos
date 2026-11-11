## TL;DR

Task #1071 shipped release email support for projects with a configured email provider. Final review verdict: **good to go**; the task was merged and marked done.

## Outcome

When enabled in Settings or `[release.email]`, stable releases can email configured recipients with release notes, known issues, and links. The feature includes a rendered preview, status and resend controls, GitHub publication detection with a tagged fallback, and per-recipient send tracking. Missing-provider and send-failure states are surfaced in the Releases page and bell notices. Prereleases are skipped by default.

The final review found no blocking defects. UI evidence covered sent and failed status rows and the settings controls.

## Process stats

- Development rounds: 5 recorded.
- Review rounds: 8; final verdict was **good to go**.
- Wall-clock from creation to done: 2026-11-09 04:42:41 UTC to 2026-11-11 20:21:22 UTC (2 days, 15 hours, 38 minutes, 41 seconds).
- Engineer sessions: 5 recorded model entries—haiku, composer-2.5, haiku, opencode with DeepSeek-V4.1-Flash, and DeepSeek-V4.1-Flash. Several sessions errored or stalled; exact successful restart count is not recorded.
- Reviewer: 8 passes, all recorded as Claude Code with haiku. Routing and debugger sessions also appear in the session log; their aggregate token and cost totals are not recorded.
- Tokens and cost: recorded engineer sessions total 333,281 tokens and $1.326036724. Reviewer sessions total 158,964 tokens and $0.52748152. Combined recorded totals: 492,245 tokens and $1.853518244. Some sessions have no token or cost data.
- Close-out gate: 246 seconds.

## What went wrong

- Several handoffs failed at checks or timed out during finalization. Failures included remote test errors, a server-side timeout, and flaky tests; reruns and fixes eventually produced passing checks.
- Engineer runs stalled, exited without handoff, or errored, including a restart error from an unavailable Copilot auto profile. Queued messages were delayed, and an orphaned engineer process was stopped.
- Reviews found successive release-email lifecycle issues: restart recovery, duplicate-send windows, stale UI state, missing failure notices, and publish-gate handling. These were fixed over later rounds, with tests added for the affected paths.
- A fixed-sleep process test hung during a check. The helper and decoy sleeps were made unique per run.
- The final review noted a naming mismatch between captured PNG files and evidence JSON, and an inconsistent landing-checklist count. Neither blocked approval.

## Learnings

- Set in-flight guards before the first await, keep progress state caller-owned, and persist each accepted recipient before continuing. These patterns now protect both automatic sends and Resend.
- Distinguish transport failures, HTTP error responses, and a genuine 404 when deciding whether GitHub publication is confirmed.
- Replace fixed sleeps in process tests with readiness signals or isolated timing so load does not create races. Carry durable test and workflow guidance into `docs/agent-debugging-and-incidents.md` and `docs/agent-workflow-rules.md`.
- Keep docs precise about per-recipient at-most-once behavior and the provider-acceptance-to-local-write window; see `docs/releases.md`.

## Follow-ups

None recorded in Linked tasks.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
