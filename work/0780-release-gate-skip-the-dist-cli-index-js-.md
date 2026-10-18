---
id: "0780"
title: "Release gate: skip the dist/cli/index.js check for projects without a bin target"
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "error: Transport"
debug_tldr: "The engineer run stopped on a Transport disconnect (harness/API), not a repoos check failure—resume or restart the engineer on #0780."
debug_tldr_at: "2026-10-18T17:30:39Z"
debug_tldr_key: "dev-error|error: Transport"
priority: p0
area: core
merged_commit: 6844edf20bd8c9a9f481477423b6549f6bbe3981
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/release-gate-skip-the-dist-cli-index-js-
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-14T08:20:29Z"
updated_at: "2026-10-18T17:30:39Z"
last_close_out_gate_ms: 121907
last_close_out_gate_at: "2026-10-14T08:47:47.001Z"
review_passes: 1
dev_error_count: 1
---
## Problem
Publishing a release from the Releases page fails for a project that has no CLI. Divot (a Swift app, no package bin) hit this when cutting v0.1.0:

> CLI build output missing from dist/cli/index.js — check that the build completed successfully and rebuild.

The release already committed the version bump locally before the failure, so the repo was left with an unpushed 'release: v0.1.0' commit and no tag. Divot's build does not produce dist/cli/index.js, so the check cannot pass for it.

## Expected
The release gate should only require dist/cli/index.js when the project declares a bin target that points to it. This matches the integration gate, which already does this in src/server/integration-orchestrator.ts (expectsOwnCli, reading package.json bin). A project with no such bin should release without the CLI check.

## Also
- A release that fails after its version-bump commit should not leave that commit on the branch. Either roll back the bump, or make the failure say clearly that the bump commit exists and how to undo it.
- The exact error text was not found in this checkout (src or dist). Confirm which code path produces it, including the globally installed repoos (v0.5.71 at ~/.bun/bin/repoos) that the release may run.

## Acceptance criteria
- Releasing a project with no bin target does not run or require the CLI build check.
- Releasing a project whose package.json bin points to dist/cli/index.js still requires that file and fails clearly when it is missing.
- A failed release does not leave an unpushed version-bump commit without a clear message.
- Tests cover a no-bin project (Divot-like) and a bin project (RepoOS-like) through the release path.

## Notes for AI
Repro: Divot at ~/code/nick/divot, the Releases page, version 0.1.0, publish. The affected commit is 45e33c9b on local main, not pushed; do not rewrite local main without asking the maintainer, since there are later RepoOS bookkeeping commits on top of it.

## Activity

- 2026-10-14T08:20:29Z · created · njachowski@gmail.com
- 2026-10-14T08:21:08Z · status inbox→ready
- 2026-10-14T08:21:23Z · model_override
- 2026-10-14T08:21:30Z · status ready→active, branch
- 2026-10-14T08:26:36Z · message_queued at 2026-10-14T08:26:36.915Z
- 2026-10-14T08:26:37Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-14T08:31:17Z · body
- 2026-10-14T08:32:10Z · body
- 2026-10-14T08:42:40Z · status active→review
- 2026-10-14T08:42:41Z · note: shots: skipped — the diff (4 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-14T08:43:45Z · note: review pass 1: good to go
- 2026-10-14T08:47:47Z · close-out gate completed in 122s
- 2026-10-14T08:48:47Z · status review→done, release:success
- 2026-10-18T17:27:02Z · status done→ready
- 2026-10-18T17:27:06Z · cli_override, model_override
- 2026-10-18T17:27:08Z · status ready→active
- 2026-10-18T17:30:10Z · agent exited with an error (opencode) · error: Transport
