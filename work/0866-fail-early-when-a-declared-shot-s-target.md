---
id: "0866"
title: Fail early when a declared shot's target cannot render its state or route
type: bug
status: review
priority: p2
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/fail-early-when-a-declared-shot-s-target
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T11:55:38Z"
updated_at: "2026-10-20T23:09:07Z"
review_passes: 1
last_check_failure: "repoos check at 2026-10-20T21:59:05.771Z: repoos check failed: ◆ Check plan"
---
## Problem
A declared shot that resolves to the wrong preview target produces a capture of the wrong screen, and the failure shows up far from the cause. Observed 2026-10-20: #0860's Settings shot resolved to the Docs site target (console error "'text/html' is not a valid JavaScript MIME type", highlight matched nothing, handoff failed UI verification), and #0861's `drawer:shotEvidence` shot was captured on the Docs site / the board instead of a task drawer, so the reviewer reported an evidence gap on pass after pass. Each cost several rounds because the engineer only learns about it from a later review, and weaker models do not self-correct from the message.

## Desired UX
When shots are declared, declaring is validated against the resolved target before any capture: the target must be able to serve the route, and a `state` fixture must be one the target supports. A mismatch fails at declaration/handoff time with a message naming the shot, the resolved target, why it cannot work (e.g. "state drawer:shotEvidence needs the app target; this shot resolved to Docs site") and what to set (`target` and a drawer route such as /work?task=9999&tab=changes). A captured PNG that is the wrong screen (a state fixture that never rendered, e.g. a board when a drawer was declared) is reported as a failed shot, not as a pass.

## Acceptance criteria
- Declaring a `state` fixture on a target that does not support it is rejected with the message above.
- A route that returns the target's 404/HTML shell for a module (the vitepress MIME error) is detected and reported as "route not served by this target".
- A declared state or highlight that did not render fails the shot with the target name in the message.
- The default target for a declared shot is the app target when its route or state is an app route/fixture, not the first configured target.
- Tests for: wrong target + app state, route not served, state not rendered, correct declaration still passes.
- Docs updated (AGENTS.md shot hygiene paragraph if its wording changes).

## Notes for AI
See the shot declaration and capture code in src/server/shot-capture.ts, `planAutoCapture`, the state fixtures (`closeOut:active`, `card:doneError`, `board:withReviewTask`, `drawer:shotEvidence`) and the #0830 shot-hygiene rules in AGENTS.md. Related: #0819 precedent for opening a drawer by route. Do not weaken the existing failing-declared-miss behavior; this adds earlier and clearer detection.

## Activity

- 2026-10-20T11:55:38Z · created · njachowski@gmail.com
- 2026-10-20T21:10:18Z · status inbox→ready
- 2026-10-20T21:10:23Z · cli_override, model_override
- 2026-10-20T21:10:24Z · status ready→active, branch
- 2026-10-20T21:29:49Z · message_queued at 2026-10-20T21:29:49.457Z
- 2026-10-20T21:37:41Z · body
- 2026-10-20T21:41:30Z · body
- 2026-10-20T21:43:34Z · body
- 2026-10-20T21:45:02Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-20T21:45:03Z · message_delivered: 1 message(s)
- 2026-10-20T21:59:02Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-20T22:06:57Z · body
- 2026-10-20T22:10:55Z · status active→review
- 2026-10-20T22:10:56Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (a66d6ab81) during finalization (#0734)
- 2026-10-20T22:12:16Z · note: review pass 1: good to go
- 2026-10-20T22:21:01Z · note: message interrupts in-flight review — delivering to engineer first
- 2026-10-20T22:21:02Z · status review→active
- 2026-10-20T22:21:02Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T22:21:49Z · body
- 2026-10-20T22:23:02Z · status active→review
- 2026-10-20T22:23:10Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (a66d6ab81) during finalization (#0734)
- 2026-10-20T22:58:38Z · assigned_to
- 2026-10-20T23:00:21Z · assigned_to
- 2026-10-20T23:00:34Z · status review→active
- 2026-10-20T23:00:41Z · note: handoff requested (ui-review)
- 2026-10-20T23:09:07Z · status active→review
- 2026-10-20T23:09:07Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (7793441f0) during finalization (#0734)
