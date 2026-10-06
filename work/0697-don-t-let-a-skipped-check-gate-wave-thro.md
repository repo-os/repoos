---
handoff_signal_retry_count: 1
id: "0697"
title: Don't let a skipped check gate wave through a branch that adds a buildable project; tell the reviewer when the gate skipped
type: feature
status: active
priority: p1
area: [server, core]
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/don-t-let-a-skipped-check-gate-wave-thro
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T03:15:44Z"
updated_at: "2026-10-06T05:16:02Z"
---
## Problem

#0592 made an empty check plan a `skipped` outcome, which is right for a docs-only repo. On tuk-private a branch (#0005) added a root `package.json`, `bun.lock`, an Ionic app, Android/iOS projects and 22 vitest tests; handoff and three review rounds ran with the gate skipped, so nothing was built or typechecked (running it by hand found `error TS2305 ... no exported member 'PluginListenerHandle'` and a broken lint script). The reviewer prompt then says `The implementer already ran \`repoos check\` green to enter review, so do NOT re-run the full build or test suite` — false here, and it tells the reviewer not to check. The reviewer also judged the stale copy of the task file committed on the branch instead of the spec in its prompt.

## Desired UX

When a branch introduces a buildable project and the repo has no check plan, handoff says so plainly and asks for a plan (or runs an inferred one); the reviewer is told when the gate skipped and verifies the task's own proof command instead.

## Acceptance criteria

- [ ] At handoff/close-out, if the resolved plan is empty but the branch diff adds `package.json`, `go.mod`, `Cargo.toml` or `gradlew`, either run the plan `--print-plan` would infer for that tree or fail handoff with an actionable message (`this branch adds a project but repoos.toml declares no [[check.steps]]; run repoos check --print-plan`). Pick one, document why.
- [ ] The reviewer prompt states the actual check outcome (`passed` / `skipped: no check plan`); on `skipped` it drops the "already ran repoos check green" sentence and asks the reviewer to run the task's proof command if one is named (finite commands only).
- [ ] The reviewer prompt says the spec in the prompt is authoritative and the worktree's copy of the task file may lag main.
- [ ] Tests for: docs-only repo still skips cleanly; branch adding package.json with no plan; reviewer prompt text for both outcomes.
- [ ] `user-docs/check.md` (When a repo declares nothing) updated.

## Notes for AI

Evidence: `~/code/tuk/tuk-private/repoos/docs/repoos-feedback.md` (tuk-private run, 2026-10-06), item 1, 3.

#0592 (done) introduced `skipped`; keep its never-green invariant. Reviewer prompt: `src/server/review.ts`. Inference: the `--print-plan` path in `src/commands/check.ts`.

## Activity

- 2026-10-06T03:15:44Z · created · unknown
- 2026-10-06T04:37:19Z · status inbox→ready
- 2026-10-06T04:37:21Z · cli_override, model_override
- 2026-10-06T04:37:21Z · status ready→active, branch

