---
id: "0130"
title: Make post-merge close-out checks reliable and diagnosable
type: bug
status: ready
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-12T09:21:08Z"
updated_at: "2026-08-12T09:21:28Z"
---
## Activity

- 2026-08-12T09:21:08Z · created · unknown
- 2026-08-12T19:05:00Z · implemented · ai

Diagnosis (#0130): the post-merge gate ran `repoos check` (resolved, via a
symlinked global install, to the main checkout's own `dist/`) as the FIRST
candidate with a 240s SIGKILL budget, returned on its first non-zero exit
without falling back to the merged checkout's freshly-built CLI, and collapsed
failure to the FIRST 6 output lines with no command, exit status, or stage —
so a transient/timing failure under server load (the full tsc build + vitest +
WebKit smoke test) surfaced as an opaque "repoos check failed" that the
operator's later warm, idle re-run passed. A retry after the branch was already
integrated re-ran `preflightMerge`, which falsely passed a missing branch and
then mislabelled the task as failed-to-merge.

Fix: `completeTask` now runs the merged checkout's own `dist/cli/index.js
check` first with a generous budget (mirroring the handoff path), captures
command/stage/exit status plus a redacted bounded tail of stdout+stderr in
`CheckSummary` (build/screenshots/check), detects an already-integrated branch
(`alreadyMerged`) so a retry resumes build → screenshots → check → done →
cleanup instead of mislabelling a failed merge, and fails fast on a missing
branch. Regression tests in `src/ui-app/tests/done-reliability.test.ts`.


## Problem

`POST /api/tasks/:id/done` can merge a review branch successfully, rebuild,
regenerate screenshots, and then report a failed post-merge `repoos check`
despite the same command passing immediately when run directly from `main`.
The endpoint truncates the useful failure output, leaves the task in `review`,
and requires a human/operator to infer that the merge already happened and
complete its done marker and cleanup manually.

Observed on #0117 and #0114. The failure is especially hazardous because a
retry may report the same error after the branch is already integrated.

## Desired UX

Moving a reviewed task to done either completes the entire lifecycle or
returns an actionable failure that accurately identifies the failing stage.
After a successful merge, a retry must be safe and must finish remaining
validation, release recording, and cleanup rather than treating the branch as
a new conflicting merge.

## Acceptance criteria

- [ ] Reproduce and identify why the close-out server subprocess can disagree
  with an equivalent direct `repoos check` invocation.
- [ ] Preserve sufficient stdout, stderr, exit status, command, and stage
  context for a failed post-merge build, screenshot, or check gate without
  leaking sensitive values.
- [ ] Do not label a task as failed-to-merge when the branch has already been
  integrated into `main`; make close-out retry behavior idempotent.
- [ ] After a merge succeeds, resume the remaining close-out steps safely or
  present a clear recovery state instead of silently stranding the task in
  `review`.
- [ ] Add regression tests covering an already-merged retry and a subprocess
  gate failure with diagnostic output.
- [ ] Preserve the existing order: merge, build, screenshot generation, full
  check, release marker/status done, then worktree/branch cleanup.
- [ ] Run `repoos check` before moving this task to review.

## Notes for AI

Investigate `src/server/done.ts` and its process-spawning/error-truncation
helpers first. Do not weaken or skip the post-merge gates, mark a task done
before a green gate, or solve this by requiring manual shell recovery. Keep
the no-remote RepoOS lifecycle authoritative; an endpoint retry after a
server reload must remain safe.

## Activity

- 2026-08-12T09:21:28Z · status inbox→ready
