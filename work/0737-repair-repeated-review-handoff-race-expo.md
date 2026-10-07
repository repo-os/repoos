---
id: "0737"
title: Repair repeated review handoff race exposed by pre-release coverage
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/repair-repeated-review-handoff-race-expo
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-07T10:16:47Z"
updated_at: "2026-10-07T11:26:54Z"
---
## Problem
Current main 541f9b3c78567799f5d0f5b5b44cfef7f9babf8b, compiled version0.5.67 hashfb4bf9051342bd324397256c375a881b7621b9ccf675853ab448e140f7e9465c. Pre-release bun run test:coverage failed agent-review.test.ts:361 second requestReview after human PATCH active: expected202 got200. Isolated single-worker reproduction also failed expected202 got409. Evidence /private/tmp/repoos-pre-release-coverage.log and /private/tmp/repoos-review-reproduction.log. Do not assume a flake or broaden timeouts.

## Desired UX
A completed review returned to active may request another handoff reliably. Capture HTTP response bodies and task/index/runner/finalization state to determine whether this is a product lifecycle race or a test awaiting the wrong completion boundary. Preserve the actual diagnosis and fix the responsible boundary.

## Acceptance criteria
Deterministic regression covers the identified race; focused real server lifecycle test passes with same HEAD across repeated reviews, no duplicate reviewer and no premature status transition. If only the fixture synchronization is wrong, fix that synchronization with a meaningful completion condition, not sleeps/retries masking an actual failure. Build and scoped check once, full handoff then independent review.

## Notes for AI
Read AGENTS.md. Use existing task worktree, Cursor/composer-2.5. Independently verify diagnosis on current main and running build before implementation; external reports may be stale, record commit/version/repro and relevance. Inspect routes/tasks.ts patchTask, server.ts startUnifiedHandoff, agent-review test requestReview/waitForReviewRunning. Do not edit main or other task worktrees, config, hosts, releases, or restart server. No hand edits work/*.md. Do not weaken lifecycle/check guards or merely accept200/409. If conflicts with #0724/#0728 arise preserve both feature sets. One scoped check after building, handoff once then end turn.

## Activity

- 2026-10-07T10:16:47Z · created · unknown
- 2026-10-07T10:17:09Z · cli_override, model_override
- 2026-10-07T10:18:04Z · status inbox→ready
- 2026-10-07T10:18:13Z · status ready→active, branch
- 2026-10-07T10:36:24Z · body
- 2026-10-07T10:38:48Z · body
- 2026-10-07T10:52:31Z · body
- 2026-10-07T11:00:30Z · note: Release blocker evidence10:55: #0730 post-conflict fullhandoff failed same repeated-review requestReview test215 expected202got200 on thinkpad, 5235 other tests passed. Please prioritize deterministic fix and handoff after build/scopedcheck; do not broaden into unrelated suite failures or retry fullpassingremotechecks for local-only failures. Driver holds #0730 identical gate retries pending your landing. Preserve actual200/409 response-body diagnosis and no duplicate-review semantics.
- 2026-10-07T11:03:31Z · body
- 2026-10-07T11:05:05Z · body
- 2026-10-07T11:26:54Z · handoff failed · handoff recovery attempted · finalization failed
