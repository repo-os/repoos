## TL;DR

Task 1074 shipped and merged as `d1b88ebf653505eb9b01cd41696c49a014efc6f6`. Human-assigned tasks now get guide scaffolding and shared warnings when their guide is missing or unfilled. Final review verdict: **good to go**.

## Outcome

The change updates human-task scaffolds, split templates, and built-in PM and engineer guidance to call for a `## Step-by-step guide`. CLI and HTTP task creation or updates warn when a human task lacks usable numbered steps, and the task drawer displays the warning. Authors can edit the section with `repoos update --section`.

The warning is advisory, so existing tasks remain usable. Fence-aware Markdown scanning protects guide detection and section editing. The branch was merged and the task completed successfully.

## Process stats

- Development rounds: 6 recorded.
- Review passes: 8; final verdict was **good to go**.
- Wall-clock from task creation to completion: 2026-11-09T07:52:08Z to 2026-11-11T21:09:02Z.
- Engineer: Cursor / composer-2.5 and gpt-6-luna; recorded session times were 6,987s and 3,605s, respectively. Restarts and swaps: recorded in the activity log; total distinct restart count is not recorded.
- Reviewer: Claude Code / haiku and Muse / muse-spark-1.3. Reviewer session token and cost totals are recorded for some sessions, but aggregate totals are not recorded.
- Routing: openrouter / typesafe/jev-1.14-20261014. Debugger attempts used Copilot with model `default`; token and cost figures are not recorded.
- Engineer token usage: 15,446,160 and 3,000 tokens recorded for the two sessions. Cost: not recorded.

## What went wrong

- The first handoff signal was not detected, and queued messages were repeatedly delayed. The task was resurfaced and resumed.
- Engineer sessions crashed or stalled, including connection timeouts and DNS failures. Several debugger restarts failed because the Copilot `efficiency` auto profile was unavailable. Work resumed and eventually passed handoff and review.
- Handoffs failed on unrelated test failures, a UI smoke check, a server reload, and finalization timeouts. A serialized local check wait was escalated and later cleared.
- Review passes found missing PM split guidance, an incomplete-guide warning gap, foreign task bookkeeping, and repeated Markdown fence parsing bugs. These were fixed across subsequent rounds; the task’s own work file was resolved during close-out.
- The declared drawer shot was brittle and its recorded filename was stale. Review accepted the captured banner evidence on the final tree; the final verdict was good to go.

## Learnings

- Keep human-task guide requirements consistent across prompts, scaffolds, CLI/API warnings, and the drawer. The durable rule is in `AGENTS.md` and `docs/agent-workflow-rules.md`; user guidance is in `user-docs/cli.md`.
- Markdown section scanners need shared fence-aware handling. This change uses the shared helper for the scanners it touches; the final review identified other existing scanners as a class-sweep candidate.

## Follow-ups

None recorded.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
