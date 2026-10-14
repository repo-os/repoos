---
id: "0780"
title: "Release gate: skip the dist/cli/index.js check for projects without a bin target"
type: bug
status: inbox
priority: p0
area: core
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-14T08:20:29Z"
updated_at: "2026-10-14T08:20:29Z"
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
