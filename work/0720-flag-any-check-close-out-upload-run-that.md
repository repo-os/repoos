---
id: "0720"
title: "Flag any check/close-out/upload run that exceeds 1.5x its own median, in the UI and the attention feed, while it is still running"
type: feature
status: review
priority: p1
area: [server, web]
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/flag-any-check-close-out-upload-run-that
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T14:26:00Z"
updated_at: "2026-10-07T02:30:48Z"
last_check_failure: "repoos check at 2026-10-07T01:25:57.253Z: server-side finalization timed out (deadline exceeded)"
merge_conflict_retry_count: 2
review_passes: 3
review_rounds: 1
dev_error_count: 2
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
        "waitMs": 700
      }
    ]
  },
  {
    "label": "Remote runners status; slow badges appear only during a slow run",
    "target": "default",
    "route": "/checks?tab=remote",
    "highlight": ".rr-slow-badge",
    "steps": [
      {
        "waitMs": 400
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
