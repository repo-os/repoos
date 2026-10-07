---
updated_at: "2026-10-07T05:29:52Z"
review_passes: 1
id: "0727"
title: "Give the CTO the routine: evaluate and enable the approval policy and CTO safe actions on this repo, and close the gaps the 2026-10-06 run exposed"
type: feature
status: review
priority: p1
area: server
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: feat/give-the-cto-the-routine-evaluate-and-en
created_at: "2026-10-07T02:05:31Z"
---
## Problem

#0686 (approval policy) and #0688 (CTO safe actions) are merged but opt-in, and this repo's repoos.toml has no [approval] section, so neither helped during the 2026-10-06/07 run: every green review was approved by a human/driver, and every dead engineer was restarted by hand.

## Desired UX

- VERIFY FIRST: read src/core/approval-policy.ts, src/server/approval-policy.ts, src/core/cto-actions.ts and the Settings controls; list what each can do today.
- Propose a conservative default policy for this repo (areas/types that may auto-land, conditions: gate green, review green, lock sha equals HEAD, main clean, not UI unless clean screenshots, not machinery paths, not p0 without a human) and document it. Do not enable it in repoos.toml without the owner (config is his): put the proposal in the task and enable only on his approval.
- Close the gaps the run exposed: auto-sync main into a conflicted branch is #0679 (reference, do not duplicate); restart policy for a dead engineer (network stall: resume; degenerate loop: fresh session) as CTO safe actions with rate limits; serialize merges; every automatic action recorded in the activity log and the bell, with a kill switch.

## Acceptance criteria

- Tests per new safe action and per policy condition (lock sha mismatch blocks, dirty main blocks, UI without evidence blocks). Settings UI controls and docs (docs/, user-docs). repoos check passes.

## Notes for AI

Related: #0686, #0688, #0693, #0679, #0720, #0723.

## Framing (2026-10-07)

No new role or persona: the CTO (src/server/cto.ts, cto-monitor.ts, cto-actions.ts) is the one that takes over the routine landing/restart/retry work, under the owner's policy and with the existing allowlist, rate limits and audit trail. External driver sessions (Claude Code, Codex) stay optional. Anything outside policy is escalated to the human through the attention feed.

## Shots
```json
[
  {
    "label": "Settings General: new automation kill switch, blocked paths and p0 controls",
    "target": "default",
    "route": "/settings?tab=general",
    "highlight": "#setting-automation.paused"
  }
]
```

## Activity

- 2026-10-07T02:05:31Z · created · unknown
- 2026-10-07T02:06:09Z · note: Created as part of story 0009 (Autopilot).
- 2026-10-07T02:10:58Z · story
- 2026-10-07T02:11:10Z · title, body
- 2026-10-07T04:35:32Z · status inbox→ready
- 2026-10-07T04:35:45Z · status ready→active, branch
- 2026-10-07T04:52:10Z · body
- 2026-10-07T04:53:39Z · body
- 2026-10-07T05:10:45Z · body: section Shots
- 2026-10-07T05:12:17Z · body
- 2026-10-07T05:14:15Z · body
- 2026-10-07T05:15:11Z · body
- 2026-10-07T05:17:05Z · body
- 2026-10-07T05:20:24Z · body
- 2026-10-07T05:21:58Z · body
- 2026-10-07T05:28:40Z · status active→review
- 2026-10-07T05:28:40Z · note: shots: skipped — 1 handoff shot already captured during finalization (#0680)
- 2026-10-07T05:29:52Z · note: review pass 1: good to go

