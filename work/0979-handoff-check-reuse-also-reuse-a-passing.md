---
id: "0979"
title: "Handoff check reuse: also reuse a passing remote engineer self-check"
type: bug
status: ready
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-29T12:34:06Z"
updated_at: "2026-10-29T12:34:42Z"
---
## Problem
#0976 replaced handoff's remote self-check reuse (`findReusableRemotePreReviewPass` in `src/server/engineer-remote-self-check.ts`) with the new local reuse in `src/core/check-reuse.ts`, which needs a `reuseContext` on the check row. Remote engineer self-checks do not record one, so once remote validation is turned back on, a passing remote self-check on the same commit is no longer reused at handoff and the remote gate runs again.

## Desired UX
A passing engineer self-check, local or remote, on the same clean commit and main base is reused at handoff.

## Acceptance criteria
- Remote self-check runs record `candidate_sha` and the same `reuseContext` (main sha, merge base) that local runs record.
- `findReusableHandoffCheck` accepts such a row; handoff skips the remote pre-review gate and the tests step, and says "reused check <id>".
- Remove `findReusableRemotePreReviewPass` if nothing else uses it.
- Tests: a remote self-check row on the same tree is reused; one on a different commit is not.

## Notes for AI
Remote validation is currently off in repoos.toml; tests must use fakes. Do not edit repoos.toml.

## Activity

- 2026-10-29T12:34:06Z · created · njachowski@gmail.com
- 2026-10-29T12:34:20Z · cli_override, model_override
- 2026-10-29T12:34:42Z · status inbox→ready
