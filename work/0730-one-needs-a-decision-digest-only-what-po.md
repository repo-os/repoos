---
id: "0730"
title: "The CTO's 'needs a decision' digest: only what policy cannot handle, with cause and evidence attached"
type: feature
status: active
priority: p2
area: [server, web]
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: feat/the-cto-s-needs-a-decision-digest-only-w
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-07T02:05:38Z"
updated_at: "2026-10-07T11:05:52Z"
close_out_repair_count: 1
review_passes: 1
---
## Problem

A driver (human or AI) had to reconstruct 'what needs me, and why' from task files, locks, checks.db and logs. The attention feed lists items but not always the cause, the evidence and the suggested next step.

## Desired UX

- One endpoint, one CLI command (`repoos attention` or similar; see #0723) and one UI panel listing only items that automation did not or cannot resolve: failed handoff/close-out with the extracted cause (failing test names, step, host) and links to the evidence (check run id, log path), reviews that disagree with the gate, decisions that need the owner (config, hosts, release), stuck/hung runs.
- Each item names the safe actions available (retry, re-request review, merge main into branch, restart fresh) and which ones the policy would take automatically.

## Acceptance criteria

- Tests for item classification, cause extraction and the action list. UI uses the shared components. Docs. repoos check passes.

## Notes for AI

Read src/server/attention-feed.ts and the done-error debug tl;dr first and reuse them. Related: #0720, #0723.

## Framing (2026-10-07)

This digest is the CTO's escalation surface: what it did automatically (audit) and what it is handing to the human, with cause and evidence.

## Driver constraints for engineer and reviewer

Owner wants release soon. Verify diagnosis independently against CURRENT main and running build before implementation/approval; record commit/version and reproduction, classify external RepoOS-managed repo reports as still relevant, partly fixed, already fixed, or misdiagnosed. Do not implement stale reports blindly. These two tasks share attention-feed/CTO surfaces: preserve independent responsibilities and coordinate via task notes; no concurrent writer in a worktree. #0729 runner repair is release-critical, do not overwrite installed runner guards or change owner config/hosts/restart server. Build after UI/source changes BEFORE one scoped repoos check --changed main; handoff runs the full gate. If only one local step fails, rerun that step instead of the entire passing suite. Request handoff ONCE, then END TURN with no subsequent commits/task updates. Required UI shots must show actual changed screens/state; temporary browser route-interception fixtures stay outside production code and are labeled. No release/tag/push/PR/direct-main commit.

## Shots
```json
[
  {
    "label": "Mission Control Needs a decision panel",
    "target": "default",
    "route": "/",
    "highlight": ".digest-item, .panel-title"
  }
]
```

## Activity

- 2026-10-07T02:05:38Z · created · unknown
- 2026-10-07T02:10:58Z · story
- 2026-10-07T02:11:14Z · title, body
- 2026-10-07T09:29:38Z · status inbox→ready
- 2026-10-07T09:46:40Z · cli_override, model_override
- 2026-10-07T09:46:40Z · status ready→active, branch
- 2026-10-07T09:47:41Z · body
- 2026-10-07T09:54:41Z · body
- 2026-10-07T09:55:30Z · body: section Shots
- 2026-10-07T10:09:11Z · handoff failed · remote validation failed: remote validation failed (exit 1) —  ❯ tests/decision-digest.test.ts:174:26
    172|       approvalByTaskId: {},
    173|     });
    174|     expect(digest.items).toEqual([]);
       |                          ^
    175|   });
    176| });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
 Test Files  1 failed | 431 passed | 1 skipped (433)
      Tests  2 failed | 5189 passed | 15 skipped (5206)
   Start at  10:04:48
   Duration  254.54s (transform 6.57s, setup 2.06s, import 44.46s, tests 239.71s, environment 200.65s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 738ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  10:09:03
   Duration  2.75s (transform 1.16s, setup 14ms, import 1.46s, tests 738ms, environment 455ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T10:09:11Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-07T10:14:41Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-07T10:14:41Z · status review→active
- 2026-10-07T10:14:45Z · note: Driver full-gate repair: terminal failure10:09:11, no pending handoff/live writer now. Fix the two decision-digest regressions: gate mismatch with last_check_failure must outrank Auto-approval is off; automation-on stuck-run filtering must meet the acceptance criteria instead of retaining an item solely because generic message/pause actions are manual. Diagnose semantics, do not weaken assertions blindly. Run focused decision-digest tests first, build then one scoped check, handoff once/end turn. Baseline agent-review race is independently reproducible on main; preserve evidence separately.
- 2026-10-07T10:20:06Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/decision-digest.test.ts:174:26
    172|       approvalByTaskId: {},
    173|     });
    174|     expect(digest.items).toEqual([]);
       |                          ^
    175|   });
    176| });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
 Test Files  1 failed | 431 passed | 1 skipped (433)
      Tests  2 failed | 5189 passed | 15 skipped (5206)
   Start at  10:15:23
   Duration  277.42s (transform 6.66s, setup 2.45s, import 52.40s, tests 224.47s, environment 248.06s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 552ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  10:20:01
   Duration  2.66s (transform 1.22s, setup 11ms, import 1.51s, tests 552ms, environment 503ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T10:27:08Z · body
- 2026-10-07T10:28:43Z · body
- 2026-10-07T10:37:41Z · status active→review
- 2026-10-07T10:37:41Z · note: shots: skipped — 1 handoff shot already captured during finalization (#0680)
- 2026-10-07T10:38:42Z · note: review pass 1: good to go
- 2026-10-07T10:44:25Z · status review→active
- 2026-10-07T10:44:25Z · note: close-out repair: merge-conflict
- 2026-10-07T10:45:14Z · note: Close-out10:44 failed before combined validation: merge conflict src/cli/index.ts after #728 landed. Merge current main into your existing branch, preserve #728 watch command AND #730 decisions/attention aliases and route parity. No duplicate command cases, no reset of unrelated task records. Correct panel evidence default2 already uploaded and independently viewed with zero errors; preserve it. Resolve only needed conflict, build then one scoped check, handoff once/end turn for fresh review. No main edits/host/config/release actions.
- 2026-10-07T10:47:36Z · body
- 2026-10-07T10:49:56Z · body
- 2026-10-07T10:55:55Z · handoff failed · remote validation failed: remote validation failed (exit 1) —     215|   expect(res.status).toBe(202);
       |                      ^
    216|   expect(res.body.status).toBe("active");
    217|   const deadline = Date.now() + 30_000;
 ❯ tests/agent-review.test.ts:361:13
 ❯ withServer tests/agent-review.test.ts:282:11
 ❯ tests/agent-review.test.ts:353:11
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 433 passed | 1 skipped (435)
      Tests  1 failed | 5235 passed | 15 skipped (5251)
   Start at  10:51:18
   Duration  271.21s (transform 6.76s, setup 2.29s, import 51.33s, tests 222.99s, environment 239.47s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 409ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  10:55:50
   Duration  2.31s (transform 1.08s, setup 11ms, import 1.33s, tests 409ms, environment 481ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T11:00:20Z · note: Driver10:59: post-conflict fullgate failed ONLY agent-review repeated-review test215 secondrequest expected202got200, current-main independently reproduced and #0737 actively repairing. Your decision-digest regressions passed. Avoid blind identical full-gate retries; wait for #0737 landing then merge current main preserving watch/decisions and re-handoff. No weakening assertions or gate bypass, no duplicate engineer until pending oldexecutionterminal (currentlyfalse/noagent).
- 2026-10-07T11:05:52Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-07T11:05:52Z · status review→active
