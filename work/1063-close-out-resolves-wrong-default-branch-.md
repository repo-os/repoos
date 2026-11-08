---
id: "1063"
title: Close-out resolves wrong default branch when init.defaultBranch names a missing branch
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Acceptance criteria, Notes for AI"
paths: [src/server/integration-orchestrator.ts, src/core/repo-log.ts]
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-08T12:38:05Z"
updated_at: "2026-11-08T12:38:07Z"
---
## Problem
Reported from the "tiao" project (local-only repo, no remote): `repoos done` fails every time with `could not get main SHA` (integration-orchestrator.ts, sync phase). Confirmed cause: `git config --get init.defaultBranch` is `master` on that host, but the repo's branch is `main`.

`resolveDefaultBranch` in `src/server/integration-orchestrator.ts` (private copy) returns `init.defaultBranch` without checking the branch exists. With no `origin/HEAD` (local-only repo) it reaches that step, returns `master`, and `git rev-parse master^{commit}` fails. Reviewed tasks can't land.

## Fix
- Remove the private `resolveDefaultBranch`; use one shared resolver (the verified one in `src/core/repo-log.ts`, or a merged version).
- Every candidate (origin/HEAD target, `init.defaultBranch`, current branch) must be verified with `refs/heads/<name>` before it is returned; otherwise fall through to `main`, then `master`, then the checked-out branch.
- Include branch tried, root, exit status, timedOut flag and stderr in the `could not get main SHA` reason so this is diagnosable next time.
- Check the other call sites (lines ~2330, 2650, 3663, 3855) behave with the shared resolver.

## Tests
- Repo with branch `main`, `init.defaultBranch=master`, no remote: resolves `main`.
- Remote-less repo on `trunk`: resolves `trunk`.
- origin/HEAD pointing at a branch with no local ref: falls through.
- Failure reason contains stderr/status.

Update the `could not get main SHA` row in docs/close-out-pipeline.md.

## Separate (not in this task)
tiao agent also reports review report files showing up as inbox tasks; file separately after reproducing.

## Activity

- 2026-11-08T12:38:05Z · created · njachowski@gmail.com
- 2026-11-08T12:38:07Z · needs_input
