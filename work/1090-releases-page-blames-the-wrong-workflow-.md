---
id: "1090"
title: "Releases page blames the wrong workflow: an unrelated failed run shows as 'release workflow failed' while Homebrew is just updating"
type: bug
status: active
priority: p2
area: [server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/releases-page-blames-the-wrong-workflow-
cli_override: claude code
model_override: haiku
created_at: "2026-11-11T04:12:08Z"
updated_at: "2026-11-11T06:25:01Z"
review_rounds: 2
review_passes: 2
deferred_handoff_resume_count: 1
---
## Problem
After cutting v0.5.82 the Releases page said "The release workflow failed at 'Run oven-sh/setup-bun@v2', so some channels below may not update on their own", linking https://github.com/repo-os/repoos/actions/runs/42566925266. That run is NOT the release workflow. It is the separate "Adoption matrix" workflow (job "adoption matrix (macos-latest)", failed at setup-bun) that also runs on pushes. The real "Release v0.5.82" run (id 42956267884) succeeded, and the Homebrew tap's own "Update RepoOS formula" run was still in progress when the warning showed, so Homebrew was only lagging, not failed.

## Cause
`fetchCiFailure` in `src/server/distribution.ts` (~line 252) lists ALL workflow runs for the tag (`actions/runs?event=push&head_branch=<tag>`) and reports the first one that failed, whatever workflow it belongs to.

## Acceptance criteria
1. Only runs of the configured release workflow (the `release.yml` path from the release config) count as "the release workflow failed": query `actions/workflows/<file>/runs` or filter runs by workflow path/name.
2. A failure of an unrelated workflow (Adoption matrix, CI, etc.) never produces the "release workflow failed" banner.
3. While the Homebrew tap's update run is in progress, or less than a few minutes after a successful release run, an out-of-sync Homebrew row says "updating" rather than looking failed; keep the real "out of sync" state after the grace period.
4. Tests: unrelated failed run + successful release run -> no banner; failed release run -> banner with the right step; out-of-sync within the grace window -> updating.
5. Docs (docs/releases.md) say which workflow the banner refers to. Do not edit repoos.toml.

## Notes
Separately (not part of this task): the Adoption matrix macOS job failed at `oven-sh/setup-bun@v2`, most likely a transient download failure; re-run it, and file a task only if it repeats.

## Accepted scope and known limitations
FINAL (round 3, owner-amended): homebrewTapUpdateInProgress queries ONLY the tap's formula-update workflow (actions/workflows/repoos-release.yml/runs, repository_dispatch) and matches by the time window of the viewed release run (created between the release run start and its updated_at plus 5 minutes). The tap's run list carries no version, so matching a tag or version is NOT required; the time-window scope is accepted and documented in docs/releases.md. NOT blocking, follow-up only: another release dispatched inside the window reading Updating; a tap API error or rate limit reading Out of sync without a hint; a still-running release run missing a late dispatch; run-name versioning in the tap repo; documenting that an unset release.workflow disables the banner; the grace window for a formula ahead of the tag; unauthenticated quota per row; a view test for the updating label. Report these under Suggestions, not Bugs.

## Activity

- 2026-11-11T04:12:08Z · created · njachowski@gmail.com
- 2026-11-11T04:12:08Z · needs_input
- 2026-11-11T04:17:23Z · status inbox→ready
- 2026-11-11T04:17:24Z · cli_override, model_override
- 2026-11-11T04:17:24Z · status ready→active, needs_input, branch
- 2026-11-11T04:31:30Z · body
- 2026-11-11T04:36:57Z · CTO nudge: held — machine under pressure (CPU idle is 4% (below 5%) — holding new work until the machine has idle CPU; system load is high (3.3× per CPU, limit 3×) — waiting for headroom before starting more work)
- 2026-11-11T04:37:58Z · body
- 2026-11-11T04:48:10Z · cli_override, model_override
- 2026-11-11T04:48:27Z · engineer stopped by request
- 2026-11-11T04:55:11Z · body
- 2026-11-11T04:56:57Z · CTO nudge: held — handoff gate is running
- 2026-11-11T05:01:22Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-11T05:01:22Z · status active→review
- 2026-11-11T05:01:23Z · note: Task body is underspecified: missing sections: Desired UX, Notes for AI
- 2026-11-11T05:01:23Z · message_queued at 2026-11-11T05:01:23.091Z
- 2026-11-11T05:02:27Z · note: review pass 1: needs some work
- 2026-11-11T05:02:27Z · message_delivered: 1 message(s)
- 2026-11-11T05:02:27Z · status review→active
- 2026-11-11T05:02:30Z · CTO nudge: held — remote validation is running
- 2026-11-11T05:08:24Z · body: Accepted scope and known limitations (added)
- 2026-11-11T05:08:24Z · message_queued at 2026-11-11T05:08:24.674Z
- 2026-11-11T05:08:25Z · message_queued at 2026-11-11T05:08:25.441Z
- 2026-11-11T05:11:58Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T05:24:18Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-11-11T05:24:18Z · message_queued at 2026-11-11T05:24:18.489Z
- 2026-11-11T05:24:18Z · ↻ resuming engineer to read queued message
- 2026-11-11T05:24:18Z · message_delivered: 3 message(s)
- 2026-11-11T05:31:58Z · message_queued at 2026-11-11T05:31:58.020Z
- 2026-11-11T05:31:58Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T05:36:57Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T05:51:58Z · CTO nudge: held — handoff gate is running
- 2026-11-11T05:52:51Z · status active→review
- 2026-11-11T05:52:51Z · note: Task body is underspecified: missing sections: Desired UX, Notes for AI
- 2026-11-11T05:52:51Z · message_queued at 2026-11-11T05:52:51.574Z
- 2026-11-11T05:53:46Z · note: review pass 2: needs some work
- 2026-11-11T05:53:47Z · message_delivered: 1 message(s)
- 2026-11-11T05:53:47Z · status review→active
- 2026-11-11T06:08:23Z · body: Accepted scope and known limitations (added 1, removed 1)
- 2026-11-11T06:08:23Z · message_queued at 2026-11-11T06:08:23.183Z
- 2026-11-11T06:08:34Z · note: handoff requested (cli)
- 2026-11-11T06:11:08Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-11T06:11:08Z · message_queued at 2026-11-11T06:11:08.979Z
- 2026-11-11T06:11:09Z · ↻ resuming engineer to read queued message
- 2026-11-11T06:11:58Z · CTO nudge: held — handoff gate is running
- 2026-11-11T06:14:26Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-11T06:14:27Z · handoff failed · task-file handoff failed at review · Engineering report is missing required sections: ## Approaches tried.
- 2026-11-11T06:16:57Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T06:22:01Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at review · Engineering report is missing required sections: ## Approaches tried. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-11T06:22:01Z · note: handoff requested (cli)
- 2026-11-11T06:25:01Z · message_queued at 2026-11-11T06:25:01.177Z
