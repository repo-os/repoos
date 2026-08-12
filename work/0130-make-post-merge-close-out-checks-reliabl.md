---
id: "0130"
title: Make post-merge close-out checks reliable and diagnosable
type: bug
status: review
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/make-post-merge-close-out-checks-reliabl
created_at: "2026-08-12T09:21:08Z"
updated_at: "2026-08-12T10:56:17Z"
---
## Activity

- 2026-08-12T09:21:08Z · created · unknown


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
- 2026-08-12T10:42:09Z · status ready→active, branch
- 2026-08-12T10:56:17Z · status active→review
