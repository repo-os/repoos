---
name: "Autopilot: a driver that only handles exceptions"
number: "0009"
created_at: "2026-10-07T01:29:49.905Z"
created_by: hello@repoos.org
---
Background: on 2026-10-06/07 a human-supervised AI "driver" (Claude, then Codex) ran this board overnight: about 20 tasks merged in roughly 30 hours of wall time. Most of the driver's effort went into routine, rule-shaped work, not judgement. This story turns the routine part into RepoOS features so the driver (human or AI) only handles exceptions.

## What the driver did over and over (candidates for server rules)

- Poll for state (task status, .repoos/locks, checks.db, agents/running) every few minutes, and lose hours when its wake-ups did not fire.
- Verify a green review (lock sha == worktree HEAD, main clean), then Move to done; serialize merges because each one reloads the server.
- On a close-out merge conflict: merge main into the branch (task file from main), re-request review, retry.
- Restart engineers that died: plain resume after a network stall, fresh session after a degenerate loop.
- Cancel and retry a close-out that hangs; retry a flaky gate once.
- Write the handoff document for the next driver by hand.

## What genuinely needed judgement (keep for the AI/human)

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
| Event-driven, not polling | a watch command and documented event contract so a driver reacts to events and notices a dead driver |
| Hangs | detect and recover hung validation containers on runner hosts |
| Exceptions only | one 'needs a decision' digest with causes and evidence |
| Driver handoff | generate the driver brief from live state |
| Conflict recovery | #0679 |
| Visibility | #0720 slow-run alert, #0723 CLI/API parity |

## Success

A board with green reviews and healthy runners lands tasks with no driver at all; the driver is woken only for failures no policy covers, with the cause and evidence already attached. Release and infrastructure decisions stay human.
