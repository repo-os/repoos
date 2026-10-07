---
name: "Autopilot: a driver that only handles exceptions"
number: "0009"
created_at: "2026-10-07T02:10:48.015Z"
created_by: hello@repoos.org
---
Background: on 2026-10-06/07 a human-supervised external AI session acting as a "driver" (Claude, then Codex) ran this board overnight: about 20 tasks merged in roughly 30 hours of wall time. Most of the driver's effort went into routine, rule-shaped work, not judgement. This story gives that job to the CTO, the AI role RepoOS already has, instead of adding a new "driver" persona: the CTO takes over the routine, rule-shaped work as policy plus safe actions, and only escalates exceptions to a human (or to an external session the human chooses to run). External driver sessions keep working, but they become optional and read the same events and brief as the CTO.

## What the driver did over and over (candidates for server rules)

- Poll for state (task status, .repoos/locks, checks.db, agents/running) every few minutes, and lose hours when its wake-ups did not fire.
- Verify a green review (lock sha == worktree HEAD, main clean), then Move to done; serialize merges because each one reloads the server.
- On a close-out merge conflict: merge main into the branch (task file from main), re-request review, retry.
- Restart engineers that died: plain resume after a network stall, fresh session after a degenerate loop.
- Cancel and retry a close-out that hangs; retry a flaky gate once.
- Write the handoff document for the next driver by hand.

## What genuinely needed judgement (the CTO escalates these to the human)

Diagnosing new failures (the validateScriptArgs mirror-slot bug), deciding a reviewer finding was wrong, and asking the owner before risky changes (hotfix on main, config, hosts, releases).

## What already exists (verify before building; do not duplicate)

- #0686 approval policy (auto-approve clean, low-risk reviews with an audit trail). It is opt-in: this repo's repoos.toml has no [approval] section, so it did not fire during the run.
- #0688 CTO safe actions allowlist (restart stalled agent, refresh install, re-queue close-out; src/core/cto-actions.ts, src/server/cto-monitor.ts) and #0693 watchdog loop caps.
- #0679 (conflicts handed back to the engineer), #0720 (slow-run alert), #0723 (CLI/API parity), #0724 (cheaper close-out gate) are in flight or filed and feed this story.
- /api/events already streams server events (SSE); the attention feed already lists items needing a human.

## Tasks in this story, by theme

| Theme | Task |
| --- | --- |
| Turn the existing automation on and measure it | evaluate and enable the approval policy and CTO safe actions for this repo; close the gaps the run exposed |
| Event-driven, not polling | the CTO reacts to events (today it wakes on a timer, ctoMonitorIntervalMs); a watch command and event contract give external sessions the same feed |
| Hangs | detect and recover hung validation containers on runner hosts |
| Exceptions only | one 'needs a decision' digest with causes and evidence |
| Briefing | the CTO's board brief, generated from live state, usable as a handoff for any human or agent session |
| Conflict recovery | #0679 |
| Visibility | #0720 slow-run alert, #0723 CLI/API parity |

## Success

A board with green reviews and healthy runners lands tasks with no external driver at all; the CTO acts under policy and escalates only failures no policy covers, with the cause and evidence already attached. Release and infrastructure decisions stay human.
