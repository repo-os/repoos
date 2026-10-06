---
id: "0694"
title: Run engineer self-checks on the remote runners (not the laptop) and reuse the green remote result at handoff
type: feature
status: review
priority: p1
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/run-engineer-self-checks-on-the-remote-r
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-05T23:59:26Z"
updated_at: "2026-10-06T01:32:49Z"
review_passes: 2
review_rounds: 1
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

## Review feedback (driver, round 2)
Reviewer verdict 'needs some work' (non-blocking items, fix quickly): 1. Update AGENTS.md Definition of done: with remote validation on, 'repoos check --changed main' and managed-engineer self-checks run on a runner; add 'run repoos check once before handoff, not after every edit'. Same for any user-docs sentence that still says the scoped check is a fast local pass. 2. Derive the task from the worktree branch when REPOOS_TASK_ID is missing so local phase=cli rows in Checks > Runs show a task number (driver note in this task body). 3. Add focused tests for commitWipCheckpointForRemoteGate and for managed-engineer fallback messaging. 4. The load before/after acceptance item is WAIVED by the owner/driver (will be measured after merge); say so in the activity note. 5. Re-run repoos check --changed main, then hand off.

## Load measurement
**Before (2026-10-06 overnight, opex field run):** 3–4 parallel engineers; laptop load average 15–28 on 10 cores (mostly per-worktree `repoos check` build/vue-tsc/vitest); Tailscale runners thinkpad/bee/mini ~0.1–1.3.

**After (this change):** Managed engineer `repoos check` with `remoteValidation.engineerSelfCheckRemote` (default on) runs install/build/test on the board runner; format/lint stay local; handoff reuses a green `candidate_sha` row instead of a second remote pass. Expect laptop load during parallel engineers to drop to fast local guards only.

**Post-deploy check (driver):** On the next 3-engineer session on a small repo, compare `uptime` and top `repoos check` CPU before vs after and append numbers here.

## Shots
```json
[
  {
    "label": "Engineer self-check on runner toggle in Remote validation",
    "target": "default",
    "route": "/settings",
    "highlight": ".setting-label:has-text(\"Remote validation runner\")"
  }
]
```

## Activity

- 2026-10-05T23:59:26Z · created · unknown
- 2026-10-05T23:59:39Z · story
- 2026-10-06T00:02:25Z · status inbox→ready
- 2026-10-06T00:02:30Z · cli_override, model_override
- 2026-10-06T00:02:31Z · status ready→active, branch
- 2026-10-06T00:03:12Z · body: section Driver note: runs list and repeat local checks
- 2026-10-06T00:52:57Z · status active→review
- 2026-10-06T00:54:05Z · status review→active
- 2026-10-06T00:55:36Z · note: Load before/after (3 parallel engineers): deferred until post-merge — measure on owner hardware with remote pool enabled; record uptime/load in a follow-up note.
- 2026-10-06T01:10:11Z · handoff failed · remote validation failed: remote validation failed (exit 1) —     347|       const returned = await api(server, "PATCH", `/api/tasks/${task.i…
    348|       expect(returned.status).toBe(200);
       |                               ^
    349|       await requestReview(server, task.id, task.absPath);
    350|       await waitFor(
 ❯ withServer tests/agent-review.test.ts:279:11
 ❯ tests/agent-review.test.ts:341:11
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 406 passed | 1 skipped (408)
      Tests  1 failed | 4971 passed | 15 skipped (4987)
   Start at  01:06:09
   Duration  236.94s (transform 6.20s, setup 1.93s, import 40.04s, tests 223.74s, environment 187.29s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 713ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  01:10:07
   Duration  2.54s (transform 1.05s, setup 13ms, import 1.30s, tests 713ms, environment 440ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-06T01:16:01Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-06T01:21:25Z · status active→review
- 2026-10-06T01:26:17Z · body: section Review feedback (driver, round 2)
- 2026-10-06T01:26:22Z · status review→active
- 2026-10-06T01:32:39Z · body: section Load measurement
- 2026-10-06T01:32:40Z · body: section Shots
- 2026-10-06T01:32:49Z · status active→review
