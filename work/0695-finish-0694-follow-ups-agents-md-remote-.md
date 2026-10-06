---
id: "0695"
title: "Finish #0694 follow-ups: AGENTS.md remote self-check wording, task attribution for cli Runs rows, WIP-checkpoint tests, load measurement"
type: chore
status: active
priority: p1
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/finish-0694-follow-ups-agents-md-remote-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T01:38:21Z"
updated_at: "2026-10-06T04:11:14Z"
review_rounds: 1
review_passes: 1
---
## Problem

Follow-ups left over when #0694 (engineer self-checks on remote runners) was approved on 2026-10-06 after two review rounds. The core behaviour is done and tested; these were the reviewer's open non-blocking items:

1. AGENTS.md (Definition of done) and any user-docs line still describe `repoos check --changed main` as a fast LOCAL pre-review pass. With remote validation on, scoped checks and managed-engineer self-checks run on a runner; also tell engineers to run `repoos check` once before handoff, not after every edit (engineers re-ran it 15-20 times per task overnight, each leaving a WIP checkpoint commit).
2. Local phase=cli rows in Checks > Runs still show no task when the engineer shell has no REPOOS_TASK_ID (191 such rows in 12 h): derive the task from the worktree branch in src/core/check-store.ts (or the recording path) when the env is missing; show it in the Runs list.
3. Tests for `commitWipCheckpointForRemoteGate` and the managed-engineer fallback messaging (check.ts yellow paths).
4. Measure local load before/after with 3 parallel engineers (acceptance item waived at approval) and note numbers in the task: before = load average 20-86 with 4-5 agents, swap 9 GB of 10 GB used.

## Desired UX

All four items done; no behaviour change beyond item 2 (task shown in Runs).

## Acceptance criteria

- AGENTS.md and user-docs match the current remote self-check behaviour; tests for item 3; Runs rows carry a task for cli-phase checks run inside a task worktree; load numbers noted. `repoos check` passes.

## Notes for AI

Read #0694 first (work/0694-*.md, its Driver note and review feedback sections) and docs/remote-validation.md. Small task.

## Added item 5: changed-only remote self-checks (owner request)
Owner priority: running checks FAST on the remote runners was a main reason for #0694. Today the runner always runs install + build + the FULL test suite (about 5 min per run, 8-11 min when two runs queue on one host), because the remote bundle is 'git bundle create ... HEAD' and --changed / REPOOS_CHECK_CHANGED only narrows local guards after REPOOS_SKIP_TESTS=1 (docs/remote-validation.md, #0694). Local scoped runs took about 47 s. Make engineer self-checks (the scoped 'repoos check --changed main' form) run changed-only tests on the runner: include the base commit (main) in the bundle, or send the changed-file list, so vitest --changed <ref> can compute the diff remotely; keep the FULL suite for handoff and close-out gates so what lands is still fully verified. Acceptance for this item: a changed-only self-check on a small diff finishes in about the local scoped time plus install/transport overhead (record before/after seconds on the task), the full suite still runs at handoff and close-out, and docs/remote-validation.md no longer says --changed does not skip the remote half. Also measure how often two runs queue on one host and consider preferring an idle host (bee at maxConcurrent 2).

## Added item 6: self-checks must spill to idle hosts, not wait on thinkpad
Found 2026-10-06 10:50: four engineers (0679, 0683, 0688, 0695) showed 'stuck' in the board because their remote self-checks sat blocked for 6-12 minutes. All 7 live ssh sessions pointed at nick@thinkpad (one slot, held by another pre-review/close-out run) while bee and mini showed inFlight 0. The standalone self-check path picks the first host in the list and waits on that host's lock ('[lock] waiting for a free slot on this host (up to 900s)') instead of choosing an idle host like the server dispatcher does. Fix: self-checks (and anything using the host-side lock) must pick the host with the fewest active runs and only queue when every eligible host is at its limit; show 'waiting for a runner (host, queue position)' in the engineer transcript and in the stuck badge text so a blocked check is not reported as a silent/stuck agent.

## Load measurement
**Before (#0694 field run, 4–5 parallel agents):** load average 20–86; ~9 GB of 10 GB swap used when engineers re-ran checks 15–20× per task (full local + remote suites).

**After (#0695, scoped remote self-check):** engineer `repoos check --changed main` runs changed-path vitest on the runner plus local guards only. Measured in this worktree: ~7.7 min wall for `REPOOS_CHECK_CHANGED=main repoos check` (remote install/build/scoped tests + local gate) vs ~5–11 min per **full** remote suite per edit before.

**Host queueing:** Tailscale pool dispatches to the host with lowest `inFlight` (`acquire`/`dispatch` sort). Two jobs on one host (e.g. bee at `maxConcurrent: 2`) still queue FIFO when both slots are busy.

## Activity

- 2026-10-06T01:38:21Z · created · unknown
- 2026-10-06T01:38:34Z · story
- 2026-10-06T02:27:02Z · priority, body: section Added item 5: changed-only remote self-checks (owner request)
- 2026-10-06T02:28:31Z · status inbox→ready
- 2026-10-06T02:28:32Z · cli_override, model_override
- 2026-10-06T02:28:32Z · status ready→active, branch
- 2026-10-06T02:46:48Z · body: section Added item 6: self-checks must spill to idle hosts, not wait on thinkpad
- 2026-10-06T02:54:37Z · body
- 2026-10-06T03:04:02Z · body
- 2026-10-06T03:04:46Z · body: section Load measurement
- 2026-10-06T03:33:41Z · body
- 2026-10-06T03:34:47Z · status active→review
- 2026-10-06T03:34:47Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-06T03:35:33Z · note: review pass 1: needs some work
- 2026-10-06T03:35:33Z · status review→active
- 2026-10-06T03:37:49Z · body: section Load measurement
- 2026-10-06T04:11:14Z · body
