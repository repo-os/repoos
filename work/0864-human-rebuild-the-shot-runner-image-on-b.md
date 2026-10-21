---
id: "0864"
title: "Human: rebuild the shot-runner image on bee and record an end-to-end remote capture proof (#0854)"
type: chore
status: ready
hold: true
priority: p2
area: server
depends_on: ["0854"]
assigned_to: human
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-20T09:31:45Z"
updated_at: "2026-10-21T18:33:17Z"
---
## Problem
#0854 moves browser shots and UI verification to a runner. Its code and tests can be reviewed without a real runner, but its acceptance criterion "a real end-to-end proof on one runner, recorded in the task" needs a person: rebuild/deploy the runner image (Dockerfile.ci with Playwright/WebKit) on the Tailscale runner (bee) and hand a task off with the runner-only policy.

## Desired UX
A human rebuilds the runner image from the merged #0854 branch, runs one task handoff with the browser-capture policy set to runner-only, and records local-vs-remote Playwright process counts and the captured shot in this task.

## Acceptance criteria
- The runner image on bee includes WebKit readable by the run user.
- One real handoff captured shots and UI verification on the runner (not a local fallback), recorded here with before/during local Playwright counts.
- Any failure is filed as a follow-up task.

## Notes for AI
Human-only. Do not start this task. It depends on #0854 landing.

## Proof
Proof run (driver, 2026-10-22), with remoteValidation.browserCaptureMode = runner-only:

- Task: #0901 (health-aware runner dispatch), handoff requested 02:09 local, UI verification note at 02:28:07: 'ui verification passed: 2 of 2 shots captured with clean console'.
- Where it ran: the capture record (.repoos/ui-verification/0901.json) has sourceWorktree '/repo-worktrees/feat/health-aware-runner-dispatch-skip-runner' and evidenceDir '/repo/work/.attachments/0901/shots'. Those are the repoos-ci container's paths on a runner (thinkpad ran the test job validate-0901), not the laptop's worktree paths. No local fallback note was written.
- Shots captured: /settings?section=remote-validation (highlight remoteValidation.healthCheck) and /checks?tab=now (highlight .rr-panel).
- Local Playwright browser processes (pgrep ms-playwright, sampled every 5 s): baseline before = 0; during the capture window 02:27:33-02:28:40 = 0 on every sample.
- Caveat: the sampler also saw 5 local Playwright processes from 02:16:26 to 02:19:02. That is before the capture and was not the capture. The likely source is an engineer's own local repoos check (ui-smoke) in a task worktree; I could not identify the parent process after it exited.
- Runner images verified beforehand: bee, thinkpad and mini each have /ms-playwright with webkit-2359 (world-readable on bee).
- Not done by me: the 'before/during' Playwright count for a full engineer self-check, and any hosts other than thinkpad. Left for the human to confirm and close (repoos update 0864 --hold false; repoos mv 0864 done).

## Activity

- 2026-10-20T09:31:45Z · created · njachowski@gmail.com
- 2026-10-20T09:32:02Z · held, assigned_to
- 2026-10-20T11:26:02Z · status inbox→ready
- 2026-10-21T18:33:17Z · body: Proof (added)
