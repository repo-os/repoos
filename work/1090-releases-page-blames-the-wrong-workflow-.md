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
updated_at: "2026-11-11T05:01:22Z"
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
