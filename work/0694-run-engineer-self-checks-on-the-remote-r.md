---
id: "0694"
title: Run engineer self-checks on the remote runners (not the laptop) and reuse the green remote result at handoff
type: feature
status: active
priority: p1
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/run-engineer-self-checks-on-the-remote-r
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-05T23:59:26Z"
updated_at: "2026-10-06T00:03:12Z"
---
## Problem

Overnight 2026-10-06, with 3-4 engineers running, the laptop sat at load 15-28 on 10 cores while the remote hosts (thinkpad, bee, mini) were nearly idle (load ~0.1-1.3). Most of the local load was `repoos check` processes: build, vue-tsc and vitest run in each engineer worktree. AGENTS.md tells engineers to run `repoos check --changed main` before handoff, and that scoped check always runs locally: in src/commands/check.ts the remote pre-review gate (#0520, src/server/pre-review-remote-gate.ts) is skipped when a changed-ref is set, the standalone CLI generally cannot use the runner (`standaloneCliCanUseRemote`: the runner is owned by the server), and uncommitted changes also force a local run. The same checks then run AGAIN on a runner at handoff and at close-out, so every task pays the expensive gate two or three times, the first time on the shared laptop, where it stretched past the 300 s changed-tests cap and produced timeouts and noisy failures.

## Desired UX

- When `remoteValidation.enabled`, an engineer self-check (`repoos check`, with or without `--changed main`) dispatches to a runner through the server (the engineer does not need a separate server of its own): commit-or-stash handling as today for uncommitted work (the runner tests committed HEAD, so make the engineer path commit a WIP checkpoint on the task branch, or send a bundle including the working tree), results streamed back to the engineer transcript exactly as a local check, fallback to local only when no runner is reachable and say so.
- Keep the local fast steps local (format --fix, lint) and send only build and tests remote.
- The handoff gate must be able to REUSE a green remote pre-review result for the same HEAD instead of rerunning it (same bundle sha, same plan), so one task costs one remote run before close-out, not three.
- Surface in the task activity which machine ran the self-check and how long it took.
- A Settings control and docs (docs/remote-validation.md, user-docs) for the new behaviour, default on when remote validation is enabled.

## Acceptance criteria

- Tests: an engineer-scoped `repoos check` with remote enabled runs build and tests on the runner and not locally; an identical-HEAD handoff reuses the green result; unreachable runner falls back to local with a visible note; uncommitted work is handled without silently testing the wrong tree.
- Measure and record in the task notes: local CPU/load before vs after for 3 parallel engineers on a small repo.
- Docs updated; repoos check passes.

## Notes for AI

Read first: src/server/pre-review-remote-gate.ts (#0520), src/commands/check.ts (changedTestRef, standaloneCliCanUseRemote, shouldRunCliRemotePreReviewGate), src/server/remote-validation.ts, docs/remote-validation.md. Overlaps #0683 (remote validation reliability: probes, fallback visibility) and #0692/#0693; build on them. Longer term (out of scope here): run the engineer agent and its worktree on a runner too. Evidence: check_runs table and `ps` during the run; see the story for context.

## Driver note: runs list and repeat local checks
Also in scope, found 2026-10-06 from the Checks > Runs tab: (1) all 191 phase=cli rows in 12 h have task_id NULL, because an engineer running 'repoos check' in its own shell has no REPOOS_TASK_ID (only handoff, pre-review and close-out pass it), so the Runs list shows a dash; the worktree column still identifies the branch. Fix: set REPOOS_TASK_ID in the engineer agent environment, and/or derive task from the worktree branch when env is missing, and show it in the Runs list. (2) Engineers re-run the local check many times per task (about 15-20 runs per task in 2 hours, e.g. 20 for 0690); when you move self-checks to a runner, also consider telling engineers to run it once before handoff, not after every edit.

## Activity

- 2026-10-05T23:59:26Z · created · unknown
- 2026-10-05T23:59:39Z · story
- 2026-10-06T00:02:25Z · status inbox→ready
- 2026-10-06T00:02:30Z · cli_override, model_override
- 2026-10-06T00:02:31Z · status ready→active, branch
- 2026-10-06T00:03:12Z · body: section Driver note: runs list and repeat local checks
