---
id: "0706"
title: "Standalone self-check: prefer least-loaded remote host and stuck-badge copy"
type: chore
status: review
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/standalone-self-check-prefer-least-loade
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T03:37:47Z"
updated_at: "2026-10-08T14:43:34Z"
dev_error_count: 1
---
## Problem

#0695 review round 1 (item 6): least-loaded host preference for standalone `repoos check` self-checks (beyond the existing pool `active` sort) and transcript/stuck-badge copy were called out but not implemented in that task.

## Desired UX

Standalone engineer self-checks pick the idlest eligible Tailscale host when multiple are free; UI/transcript copy reflects queued/stuck remote runs clearly.

## Acceptance criteria

- Document or implement any host-pick change beyond current least-`active` dispatch; stuck-badge/transcript strings reviewed.

## Status (driver, 15:35)
#0705 landed (or is landing) the dispatcher/host-lock/UI core. STILL OPEN here (per the #0705 reviewer): wire src/core/remote-pool-queue.ts (currently never imported) into TailscaleRunner so queue/transcript copy reads 'waiting for a runner on <host> (position N)' instead of the old '[queued behind N other remote run(s)…]'; make standalone repoos check pick the idlest host using the same counts as the dispatcher; stuck-badge copy; UI evidence screenshot of the Remote runners tab showing lock holders/waiters and refresh feedback (the handoff PNG captured the Check plan tab). Do not redo the #0705 plumbing.

## Verify first

Verify first against current main: #0705 (merged) already made the dispatcher count standalone holders and #0717/#0725 changed runner selection; list what is still missing before changing code, and say so in your reply if the task is already satisfied.

## Shots
```json
[
  {
    "label": "Remote runners tab",
    "target": "default",
    "route": "/checks?tab=remote-runners"
  }
]
```

## Activity

- 2026-10-06T03:37:47Z · created · unknown
- 2026-10-06T03:37:48Z · needs_input
- 2026-10-06T07:32:25Z · body: section Status (driver, 15:35)
- 2026-10-08T14:06:39Z · body
- 2026-10-08T14:07:02Z · cli_override, model_override
- 2026-10-08T14:07:05Z · status inbox→ready
- 2026-10-08T14:07:06Z · status ready→active, needs_input, branch
- 2026-10-08T14:07:36Z · agent exited with an error (cursor) · RetriableError: [resource_exhausted] Error
- 2026-10-08T14:10:41Z · needs_input
- 2026-10-08T14:16:42Z · body
- 2026-10-08T14:17:26Z · body
- 2026-10-08T14:18:10Z · body: section Shots
- 2026-10-08T14:23:58Z · handoff failed · remote validation failed: remote validation failed (exit 1) —  ❯ tests/serve-reaper.test.ts:460:22
    458|       const reaped = await sweep.cleanupOrphanedRoots();
    459|
    460|       expect(reaped).toBeGreaterThanOrEqual(1);
       |                      ^
    461|       const outcome = await exited;
    462|       // The sweep's SIGTERM terminated it; the child must not have su…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 447 passed | 1 skipped (449)
      Tests  1 failed | 5473 passed | 15 skipped (5489)
   Start at  14:19:18
   Duration  274.66s (transform 6.89s, setup 2.38s, import 51.59s, tests 223.82s, environment 244.81s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 507ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  14:23:54
   Duration  2.96s (transform 1.46s, setup 13ms, import 1.79s, tests 507ms, environment 565ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-08T14:31:19Z · note: ui verification failed (1 issue(s)): [missing-target] highlight .rr-panel matched nothing on /checks?tab=remote-runners (captured http://127.0.0.1:54974/checks?tab=runs) (http://127.0.0.1:54974/checks?tab=runs)
- 2026-10-08T14:31:19Z · handoff failed · ui-review handoff failed at verify · ui verification failed (1 issue(s)): [missing-target] highlight .rr-panel matched nothing on /checks?tab=remote-runners (captured http://127.0.0.1:54974/checks?tab=runs) (http://127.0.0.1:54974/checks?tab=runs)
- 2026-10-08T14:35:15Z · body: section Shots
- 2026-10-08T14:35:57Z · note: ui verification failed (25 issue(s)): [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/api/agents/detect); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/api/tunnel/readiness); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/api/remote-validation/status); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/api/release/availabl
- 2026-10-08T14:35:57Z · handoff failed · ui-review handoff failed at verify · ui verification failed (25 issue(s)): [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/api/agents/detect); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/api/tunnel/readiness); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/api/remote-validation/status); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/api/release/available); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/api/cto); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/api/chat); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/api/config); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/api/debugger); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/api/auth/me); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/api/auth/me); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/api/health); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56740/assets/ChecksView-mAQI96z9.js)
- 2026-10-08T14:41:33Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/serve-reaper.test.ts:460:22 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-08T14:41:33Z · status review→active
- 2026-10-08T14:42:07Z · status active→review
- 2026-10-08T14:42:08Z · note: Task body is underspecified: missing sections: Notes for AI
- 2026-10-08T14:43:34Z · note: review pass 1: needs some work
