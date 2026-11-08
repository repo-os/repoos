---
id: "1057"
title: Card shows PAUSED during handoff; deferred handoff never wakes the engineer
type: bug
status: inbox
priority: p2
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-08T00:26:09Z"
updated_at: "2026-11-08T00:26:09Z"
---
## Problem
Two related lifecycle bugs seen on 2026-11-08:
1. **Card says PAUSED while a handoff is running.** #1044's engineer ended its turn with `::repoos-handoff-ready::` and the server's handoff was running (step: verify, remote shot capture), yet the board card showed "PAUSED" with a "Restart work" button. The card derives its label from "is an engineer process running" and does not treat a server-side handoff in flight (or one in its verify/capture phase) as an active state. #1054 fixed the Restart button for the "running checks" hint, but the PAUSED label path does not use the same handoff-in-flight signal.
2. **Deferred handoff deadlocks when no engineer is running.** #1050's engineer exited ("no handoff requested") with a driver message still queued. The handoff status became `deferred: 1 queued message(s) must be read before review`, but nothing started the engineer to read the message, so the task sat for about 30 minutes until a human ran `repoos start 1050`. The same shape appeared on #1054, #1048 and #1049 earlier (handoff deferred for tens of minutes while no turn was running).

## Desired UX
1. The card label is derived from the single server-backed handoff-in-flight signal: while a handoff or check is running (any step including verify/capture), show "Running checks · <step>" (or the existing running-checks line), never PAUSED, and no Restart/Pause button. PAUSED is shown only when the task really is paused (an explicit `pause`) or truly idle with nothing in flight and no queued work.
2. When a handoff is deferred because queued messages must be read and no engineer turn is running, the server automatically starts (resumes) the engineer so it reads the queued message(s), with a short activity line ("↻ resuming engineer to read queued message"), bounded by the existing retry limits so it cannot loop. If an engineer turn is already running, do nothing (the message delivers when it ends).

## Acceptance criteria
- Test: a task with no running engineer but a running handoff (steps: check, verify, review, capture) renders the running-checks state, not PAUSED, with no primary button.
- Test: an explicitly paused task still renders PAUSED with Restart work.
- Test: a deferred handoff with queued messages and no running engineer triggers exactly one auto-resume per deferral (guarded against loops by a retry counter), and does not trigger while a turn is running.
- Activity feed records the auto-resume reason.
- `repoos check --changed main` passes; UI rebuilt (if UI touched).

## Notes for AI
Start from TaskCard.vue (the label/action computed near `ACTIVE_RESTART`), stores/repo.ts (`handoffInFlight`, `handoffStatuses`), src/server/handoff.ts (the "queued message(s) must be read before review" deferral) and the existing automatic-resume machinery (`MAX_CHECK_RETRY_ATTEMPTS`, `MAX_HANDOFF_SIGNAL_RETRY_ATTEMPTS`) which should be reused for the retry cap. Do not change AGENTS.md rules about who moves tasks out of active.

## Activity

- 2026-11-08T00:26:09Z · created · njachowski@gmail.com
