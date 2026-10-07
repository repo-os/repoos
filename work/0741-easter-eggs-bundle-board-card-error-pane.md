---
id: "0741"
title: "Easter eggs bundle: board card error panel (flush, square, below the action button) and hide a stale close-out error while a new close-out runs"
type: chore
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/easter-eggs-bundle-board-card-error-pane
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-07T16:19:09Z"
updated_at: "2026-10-07T18:29:39Z"
review_rounds: 1
review_passes: 1
last_check_failure: "repoos check at 2026-10-07T16:36:48.254Z: ui verification failed (2 issue(s)): [missing-target] highlight .task-card .tc-card-footer matched nothing on / (captured http://127.0.0.1:50603/) (http://127.0.0.1:50603/); [missing-target] highlight .task-card .tc-card-footer matched nothing on / (captured http://127.0.0.1:50603/) (http://127.0.0.1:50603/)"
---
## Problem

Seen 2026-10-07 on a Review card (#0737): the action button 'Moving to done…' has square corners, but the failure message panel under it ('Leftover debug appendFileSync in tasks.ts broke 43 tests — …' with a Fix button) is a rounded box floating below the card with a gap, which looks detached from the card and clashes with the square buttons.

Also, that message was STALE: it came from an earlier failed close-out attempt (the engineer had since removed the tracing: tasks.ts on the branch has no appendFileSync and the pipeline was already in 'check' with failed:false), but it stayed on the card while the new close-out ran, which reads as 'it failed again'.

## Items (one commit each, one test each)

1. Error panel styling: render the card's error/notice panel directly below the primary action button as part of the card footer: no outer gap, no rounded corners (square like the action buttons), same border/background tokens as the footer, full card width; the inner 'Fix' button also square and flush. Keep it readable on narrow cards and in both themes (theme-contrast guard must pass). Use the existing card footer/action classes and style.css variants; no bespoke colours.
2. Stale error: when a close-out job for the task is queued or active (GET /api/integration/pipeline: active.taskId or queue contains it) and its failure message predates the job start, hide or dim the old message and show 'Previous attempt failed: <short>' collapsed behind a disclosure, so a running retry reads as running. The message returns if the new attempt fails.
3. The Fix button must stay disabled (with its tooltip) while a close-out is running for that task.

## Acceptance criteria

- Component tests for each item (class/DOM assertions, a snapshot of the panel structure, stale-vs-fresh error). Screenshot of the card footer in light and dark declared in ## Shots (route /, highlight the card footer). repoos check passes.

## Notes for AI

Read src/ui-app/src/components/TaskCard.vue (footer, the error block with the Fix action) and its styles; follow the AGENTS.md conventions (shared components, no native title tooltips). This is an easter eggs bundle: keep each item as its own small commit. Related: #0740 (card label for the integrating job); do not duplicate it.

## Shots
```json
[
  {
    "label": "Review column — card footer flush below action (light)",
    "target": "default",
    "route": "/work?status=review",
    "highlight": ".task-card .tc-card-footer",
    "steps": [
      {
        "waitFor": ".task-card"
      },
      {
        "waitFor": ".task-card .tc-card-footer"
      },
      {
        "waitMs": 500
      }
    ]
  },
  {
    "label": "Review column — card footer (dark)",
    "target": "default",
    "route": "/work?status=review",
    "highlight": ".task-card .tc-card-footer",
    "steps": [
      {
        "waitFor": ".task-card .tc-card-footer"
      },
      {
        "click": "button.theme-toggle"
      },
      {
        "waitMs": 500
      }
    ]
  }
]
```

## Activity

- 2026-10-07T16:19:09Z · created · unknown
- 2026-10-07T16:19:10Z · needs_input
- 2026-10-07T16:19:12Z · cli_override, model_override
- 2026-10-07T16:19:14Z · status inbox→ready
- 2026-10-07T16:19:15Z · status ready→active, needs_input, branch
- 2026-10-07T16:22:18Z · body: section Shots
- 2026-10-07T16:23:08Z · body
- 2026-10-07T16:24:06Z · body
- 2026-10-07T16:31:54Z · body: section Shots
- 2026-10-07T16:32:44Z · body
- 2026-10-07T16:35:08Z · body
- 2026-10-07T16:36:44Z · note: ui verification failed (2 issue(s)): [missing-target] highlight .task-card .tc-card-footer matched nothing on / (captured http://127.0.0.1:50603/) (http://127.0.0.1:50603/); [missing-target] highlight .task-card .tc-card-footer matched nothing on / (captured http://127.0.0.1:50603/) (http://127.0.0.1:50603/)
- 2026-10-07T16:38:47Z · body: section Shots
- 2026-10-07T16:39:44Z · body
- 2026-10-07T16:41:27Z · body
- 2026-10-07T16:49:15Z · handoff failed · check failed after 2 automatic retries · ui verification: capture of / failed — waitFor: Timeout 5000ms exceeded.
- 2026-10-07T16:49:15Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-07T16:55:10Z · watchdog: escalated to needs_input · check-failed-after-retries · check failed after 2 automatic retries · ui verification: capture of / failed — waitFor: Timeout 5000ms exceeded. · next step: the agent stalled or timed out — see DEFAULT_STALL_TIMEOUT_MS in src/server/agents.ts
- 2026-10-07T17:41:17Z · body: section Shots
- 2026-10-07T17:41:17Z · needs_input
- 2026-10-07T17:42:21Z · handoff failed · ui-review handoff failed at verify · ui verification: capture of / failed — goto: Timeout 30000ms exceeded.
- 2026-10-07T17:58:35Z · note: ui verification failed (4 issue(s)): [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56915/api/models?cli=cursor); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56915/api/models?cli=antigravity); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56915/api/models?cli=kiro); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56915/api/models?cli=crush
- 2026-10-07T17:58:35Z · handoff failed · ui-review handoff failed at verify · ui verification failed (4 issue(s)): [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56915/api/models?cli=cursor); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56915/api/models?cli=antigravity); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56915/api/models?cli=kiro); [request] Failed to load resource: Could not connect to the server. (http://127.0.0.1:56915/api/models?cli=crush)
- 2026-10-07T18:04:27Z · status active→review
- 2026-10-07T18:04:28Z · note: Task body is underspecified: missing sections: Desired UX
- 2026-10-07T18:05:13Z · note: review pass 1: needs some work
- 2026-10-07T18:05:14Z · status review→active
- 2026-10-07T18:06:30Z · body: section Shots
- 2026-10-07T18:07:38Z · body
- 2026-10-07T18:09:05Z · body
- 2026-10-07T18:15:31Z · handoff failed · remote validation failed: remote validation failed (exit 1) —  ❯ tests/remote-host-pool.test.ts:654:25
    652|     const next = f.runner.validate(opts("0002"));
    653|     await tick();
    654|     expect(f.pending()).toEqual(["b"]);
       |                         ^
    655|     f.release("b");
    656|     expect(await next).toEqual({ ok: true, stage: "check" });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 441 passed | 1 skipped (443)
      Tests  1 failed | 5321 passed | 15 skipped (5337)
   Start at  18:10:42
   Duration  283.85s (transform 7.75s, setup 2.46s, import 52.92s, tests 256.61s, environment 229.39s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 762ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  18:15:26
   Duration  2.74s (transform 1.15s, setup 12ms, import 1.44s, tests 762ms, environment 448ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T18:29:39Z · status active→review
