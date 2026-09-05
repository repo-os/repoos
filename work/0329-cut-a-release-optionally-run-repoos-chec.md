---
id: "0329"
title: "Cut-a-release: optionally run repoos check on the Hetzner remote validator"
type: feature
status: inbox
priority: p3
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-05T04:33:51Z"
updated_at: "2026-09-05T04:33:51Z"
---
`cutNewRelease` (`src/server/release.ts`) shells straight out to the built CLI's
`check` subcommand — it never goes through `integration-orchestrator.ts`'s
`validateCandidate`, so it never gets the `RemoteValidator` the close-out path
already uses (`docs/remote-validation.md`). Every release cut runs the full
`bun run test` locally, on the operator's own machine — the exact
memory-pressure flake class the remote validator exists to dodge, just on a
different code path.

## What to build

Give `cutNewRelease` an optional `RemoteValidator`. When
`config.remoteValidation.enabled` (and the validator is wired up the same way
`integration-orchestrator.ts` does it):

1. Before the local check step, call
   `remoteValidator.validate({ taskId: "release", worktreePath: config.root, candidateSha })`
   with `candidateSha` = `git rev-parse HEAD` after the version-bump commit.
2. On a green remote pass, run the local `repoos check` with
   `REPOOS_SKIP_TESTS=1` (same env var `check.ts` already understands) instead
   of the full local check.
3. On failure, map the result the same way the release run already does today
   (`ReleaseRun.phase`/`message`) so the Releases page's failure classification
   (`failureSummary()` in `ReleasesView.vue`) and the "Send to Debugger" handoff
   keep working. Distinguish the runner's `transient` (infra) vs a real
   red gate the same way `done.ts`'s `CheckSummary` does, per
   `docs/remote-validation.md`'s outcome table.

This is mechanically compatible with no new plumbing: the runner `git bundle`s
the local worktree and scp's it up keyed on `candidateSha` — it doesn't need a
push or a remote branch, so it works on the not-yet-pushed release commit on
`main` exactly like it works on a close-out candidate.

## Open questions to resolve while building (not blockers, just decide up front)

- **Double build.** The release path already rebuilds locally right before
  `check`, specifically to dodge the src/dist staleness gate; the remote VM
  also runs its own `bun install && bun run build` for the actual test run.
  That duplication already exists for close-out — just confirm it's
  acceptable here too, not a surprise.
- **Attended latency.** Close-out runs unattended, so VM boot/provision time
  is invisible. Cutting a release is something a human watches in the modal —
  a ~1-2 min remote-provision delay might read as a regression even though
  it's more reliable. Consider making this default OFF even when
  `remoteValidation.enabled` for close-out, with its own
  `remoteValidation.useForReleases` (or similar) opt-in, rather than
  inheriting the close-out flag automatically.

## Why (context)

Session 2026-09-03/04/05: cutting v0.5.37/v0.5.38 surfaced repeated local
`repoos check` test failures under memory pressure on this machine (the
agent-drivers/json-events/session-persistence skill-routing regression, plus
the pre-existing tmpdir `-worktrees` orphan leak) — all fixed, but all of it
ran against the local suite because the release path has no remote-validator
option. See memory `repoos-check-flakes-under-memory-pressure` for the pattern.

## Activity

- 2026-09-05T04:33:51Z · created · unknown
