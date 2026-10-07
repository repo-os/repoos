---
id: "0720"
title: "Flag any check/close-out/upload run that exceeds 1.5x its own median, in the UI and the attention feed, while it is still running"
type: feature
status: done
priority: p1
area: [server, web]
story: "Field report: first agent-driven project run (opex)"
merged_commit: c2b4bf07e0d91fbdbecacc9aa1f1aaacf2d17da1
assigned_to: ai
created_by: ""
branch: feat/flag-any-check-close-out-upload-run-that
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T14:26:00Z"
updated_at: "2026-10-07T15:46:59Z"
last_close_out_gate_ms: 185422
last_close_out_gate_at: "2026-10-07T15:46:48.536Z"
review_passes: 7
close_out_repair_count: 1
last_check_failure: "repoos check at 2026-10-07T12:21:44.451Z: server-side finalization timed out (deadline exceeded)"
review_rounds: 2
merge_conflict_retry_count: 2
dev_error_count: 3
---
## Problem

On 2026-10-06 the remote validation path was far slower than normal for hours (bundle uploads of 9-41 minutes, local gates over 30 minutes, 36 of 43 failed runs were 'ssh upload of candidate bundle failed') and nothing in the product said so. The human had to notice and ask. Data was already there: .repoos/checks.db check_runs has duration_ms and phase/remote/scope for every run. Typical medians since 2026-10-05: close-out remote ~285 s, pre-review remote ~290 s, local full ~432 s. 29% of pre-review remote runs exceeded 1.5x the median; the worst was 5046 s.

## Desired UX

- While a check, handoff gate, close-out stage or bundle upload is RUNNING, compare its elapsed time with the rolling median of recent PASSING runs of the same kind (phase + remote + scope, e.g. last 30 runs, minimum 5 samples). When elapsed exceeds 1.5x the median, raise one attention item ('slow run') that says: what is slow, elapsed vs typical, which host, and the likely cause when known (upload phase vs test phase, host load, laptop asleep/swapping).
- The same flag shows as a badge on the task card / close-out progress and on the Remote runners tab for the host in question, so it is obvious without opening logs.
- Report the phase that is slow: bundle upload, install, build, tests. Log bundle bytes and upload seconds if available.
- Quiet by design: one item per run, auto-cleared when the run ends; a persistent 'runs are slow lately' notice when 3+ of the last 10 runs of a kind were slow, naming the common factor (same host, same hour, upload failures).
- A setting for the multiplier (default 1.5) in Settings (every user-facing toml feature needs a Settings control).
- Sleep-aware: reuse the awake-time logic from #0678 (effectiveStalenessNow) so a sleeping laptop does not count as slowness.

## Acceptance criteria

- Tests: a run at 1.4x median raises nothing; at 1.6x raises exactly one item and clears when it finishes; fewer than 5 samples raises nothing; medians are per phase/remote/scope; sleep gaps are excluded; the persistent notice appears at 3 of 10.
- Settings control + docs (docs/ and user-docs/check.md). repoos check passes.

## Notes for AI

Read src/server/attention-feed.ts and attention-notify.ts (silent-run items), src/core/agent-run-health.ts (effectiveStalenessNow), src/core/check-store.ts (check_runs), and the Remote runners panel (RemoteRunnersPanel.vue). Do not scan raw agent output for any of this. Related: #0717 (smaller uploads), #0719 (stuck timer shows turn start instead of last output; do not copy that bug: use server-side timestamps).

## Shots
```json
[
  {
    "label": "Slow-check multiplier control in Settings",
    "target": "default",
    "route": "/settings?tab=general&focus=attention.slowRunMultiplier",
    "highlight": "[data-config-key=\"attention.slowRunMultiplier\"]",
    "steps": [
      {
        "waitMs": 1500
      }
    ]
  },
  {
    "label": "Checks remote runners tab (slow badge only when a run is live)",
    "target": "default",
    "route": "/checks?tab=remote",
    "steps": [
      {
        "waitMs": 1000
      }
    ]
  }
]
```

## Activity

- 2026-10-06T14:26:00Z · created · unknown
- 2026-10-06T14:26:08Z · cli_override, model_override
- 2026-10-06T14:30:13Z · status inbox→ready
- 2026-10-06T14:30:17Z · status ready→active, branch
- 2026-10-06T14:46:34Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-06T14:50:15Z · needs_input
- 2026-10-06T15:03:28Z · body: section Shots
- 2026-10-06T15:13:17Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-10-06T15:55:38Z · needs_input
- 2026-10-06T17:08:15Z · body
- 2026-10-06T17:08:46Z · body
- 2026-10-06T17:10:28Z · handoff failed · remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s
[validate] cloning bundle /home/nick/.repoos-0720-334e6eb2.bundle
warning: You appear to have cloned an empty repository.
fatal: unable to read tree (d9943448816cf7b32c6ee799a27fbc365521fbce) — fix it in the feature branch and re-run the gate
- 2026-10-06T17:16:22Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-06T17:16:23Z · status review→active
- 2026-10-06T17:22:06Z · status active→review
- 2026-10-06T17:22:06Z · note: shots: skipped — 1 handoff shot already captured during finalization (#0680)
- 2026-10-06T17:23:25Z · note: review pass 1: good to go
- 2026-10-06T17:30:53Z · status review→active
- 2026-10-06T17:37:12Z · status active→review
- 2026-10-06T17:37:13Z · note: shots: skipped — 2 handoff shots already captured during finalization (#0680)
- 2026-10-06T17:38:10Z · body
- 2026-10-06T17:38:57Z · note: review pass 2: needs some work
- 2026-10-06T17:38:57Z · status review→active
- 2026-10-06T17:42:39Z · body
- 2026-10-06T17:44:20Z · body
- 2026-10-06T17:54:28Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-06T17:54:28Z · status review→active
- 2026-10-06T17:54:29Z · handoff failed · could not auto-retry after check failure · agent is busy — wait for the current turn or handoff to finish
- 2026-10-06T17:55:14Z · status active→review
- 2026-10-06T17:55:15Z · note: shots: skipped — 2 handoff shots already captured during finalization (#0680)
- 2026-10-06T17:56:52Z · note: review pass 3: good to go
- 2026-10-06T18:04:29Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-07T00:56:08Z · body
- 2026-10-07T00:57:22Z · body
- 2026-10-07T01:06:34Z · note: Driver verification 2026-10-07: close-out at01:02:48Z failed agent-review.test.ts:691 final review_passes counter assertion after281s on bee. Focused current-main test (starts a fresh review run) passes1/1 in3.55s; full-suite race remains unproven. Holding another close-out pending repair/re-review. Current branch b06a77131 is clean but handoff snapshot/lock remains24b3ea891. Existing review explicitly calls UI evidence incomplete: Settings control not in frame and Agents capture was Default Agents, not Runners. Confirmed new TaskCard slowCheck :title violates AGENTS tooltip convention; commonFactorFor claims same host using only remote booleans. When an engineer slot frees, return active via API, fix scoped issues, recapture real setting/live slow badge with clean console, inspect counter race, run scoped check and re-handoff. No edits while in review; no infrastructure/config changes.
- 2026-10-07T01:10:29Z · status review→active
- 2026-10-07T01:11:50Z · body: section Shots
- 2026-10-07T01:15:21Z · body
- 2026-10-07T01:18:16Z · body: section Shots
- 2026-10-07T02:07:25Z · body
- 2026-10-07T02:07:40Z · body
- 2026-10-07T02:11:09Z · body
- 2026-10-07T02:12:52Z · body
- 2026-10-07T02:14:23Z · status active→review
- 2026-10-07T02:14:23Z · note: shots: skipped — 2 handoff shots already captured during finalization (#0680)
- 2026-10-07T02:30:48Z · note: review pass 4: failed — no usable report
- 2026-10-07T02:30:49Z · needs_input
- 2026-10-07T02:38:27Z · needs_input (review-failed) cleared for review again by human
- 2026-10-07T02:40:03Z · note: review pass 5: needs some work
- 2026-10-07T02:40:03Z · status review→active
- 2026-10-07T02:40:42Z · note: DRIVER review followup: current attention.ts:419 independently confirms wrong /agents?tab=runners link; use /checks?tab=remote with regression test. Corrected Shots plan already exists from driver01:18 but handoff reused OLD PNGs. Do not declare screenshot fixes completed merely by updating plan: recapture via sanctioned repoos shot using current Settings focus=attention.slowRunMultiplier + data-config-key highlight and Checks remote route, truthful badge label if no live slow run; stop managed preview afterward via API. No concurrent external edits; follow current main/version verification. #0712 close-out is cancelled pending runner repair (missing Vitest forks.js), do not widen timeout/alter hosts/config to bypass.
- 2026-10-07T02:41:36Z · body: section Shots
- 2026-10-07T02:43:26Z · body
- 2026-10-07T02:44:49Z · body
- 2026-10-07T02:47:10Z · body
- 2026-10-07T02:58:06Z · status active→review
- 2026-10-07T02:58:07Z · status review→active
- 2026-10-07T02:58:50Z · status active→review
- 2026-10-07T02:58:50Z · note: shots: skipped — 2 handoff shots already captured during finalization (#0680)
- 2026-10-07T03:00:38Z · note: review pass 6: needs some work
- 2026-10-07T03:00:38Z · needs_input
- 2026-10-07T03:07:23Z · status review→active
- 2026-10-07T03:07:29Z · body: section Shots
- 2026-10-07T03:08:52Z · note: shot removed: Slow-check multiplier in Settings
- 2026-10-07T03:09:12Z · note: shot removed: Remote runners slow badge on active job
- 2026-10-07T03:09:33Z · note: DRIVER repaired visual evidence03:08Z via repoos shot --task0720 FROM MAIN canonicalcorrectedplan: default-3 multiplier1.5 visible/highlighted; default-4 Checks Remote runners correctpage, normalstate(no live slow job, truthful label). CLIreports2captures; previewstopped. Removedwrongolddefault1/2viaattachmentAPI. Sourceunchanged; reviewroundcounterNOTreset. AutomaticapprovalreviewREJECTEDclearingreview-rounds-exhausted becauseexplicitownerapprovalrequired. Keepblocker; awaitownerapprovaltore-review. Currentversion/buildverificationrequirementremains.
- 2026-10-07T11:08:10Z · needs_input
- 2026-10-07T11:56:00Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-10-07T11:58:21Z · needs_input
- 2026-10-07T12:01:01Z · body: section Shots
- 2026-10-07T12:03:11Z · body
- 2026-10-07T12:43:27Z · body
- 2026-10-07T12:54:16Z · status active→review
- 2026-10-07T12:54:16Z · note: shots: skipped — 2 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-07T12:55:31Z · note: review pass 7: good to go
- 2026-10-07T15:13:21Z · status review→active
- 2026-10-07T15:13:21Z · note: close-out repair: merge-conflict
- 2026-10-07T15:15:31Z · body
- 2026-10-07T15:23:09Z · status active→review
- 2026-10-07T15:23:14Z · note: shots: skipped — 2 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-07T15:24:58Z · note: review pass 8: good to go
- 2026-10-07T15:39:52Z · note: Independent15:36 sign-off preparation under existing explicit owner authorization: current worktree clean; fresh reviewer15:24:58 good-to-go no Bugs. Reviewed check-slowness thresholds1.4x quiet/1.6x one+clear, minimum5samples, phase/remote/scope grouping, persistent3slow and sleep-gap exclusion tests; actual Settings screenshot default-3 visibly shows1.5 control/focus, declared remote shot idle truthfully has no slow badge (not visual proof of live badge). Latest handoff check20 remote scopechanged6ac43e0c3 passed419921ms; source diff/config control/docs verified. Queue normal server-owned combined gate; do not claim landing until DONE+mergedancestor.
- 2026-10-07T15:46:48Z · close-out gate completed in 185s
- 2026-10-07T15:46:59Z · status review→done, release:success
