---
id: 1040
title: "Easter eggs bundle: card details link and agent popover rows"
type: chore
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-card-details-link-and
cli_override: muse
created_at: "2026-11-05T11:41:20Z"
updated_at: "2026-11-06T05:04:26Z"
check_retry_count: 2
last_check_failure: "repoos check at 2026-11-06T04:42:19.073Z: repoos check failed: ui verification failed (2 issue(s)): [missing-target] Agent hover popover rows open the editor (target \"default\"): hover button.tc-agent-btn: hover: Timeout 5000ms exceeded. on /work (http://127.0.0.1:62027/work?shotState=card%3AhumanStep); [missing-target] Agent hover popover rows open the editor (target \"default\"): highlight [data-test-id=\"task-agent-preview\"] tbody tr matched nothing on /work (http://127.0.0.1:62027/work?shotState=card%3AhumanStep)"
handoff_signal_retry_count: 1
dev_error_count: 6
---
## Items
- E1 · Task card: drop the redundant "Details" link under the needs-input blurb
- E2 · Task-card agent hover popover: rows open the agent editor on click

Each item below has the same parts: Problem, Desired UX, Acceptance criteria, Notes for AI. Edit one item at a time with `--section`; never resend the whole body. Source: Nick, 2026-11-05. The attached screenshots show the card blurb (E1) and the hover popover (E2).

## E1 · Task card: drop the redundant "Details" link under the needs-input blurb

### Problem

A task card in needs-input state (for example "NEEDS HUMAN STEP") shows a truncated blurb ending in an ellipsis, and below it an underlined "Details" link. The blurb is already clickable and opens the same details, and the ellipsis already tells the user there is more, so the link is clutter.

### Desired UX

The blurb alone is the affordance: no separate "Details" link on the card. Clicking the blurb opens the same details as before. The blurb stays keyboard-focusable with an accessible name (for example a button role with an `aria-label` such as "Show details"), and gets a pointer cursor and hover/focus state so it still reads as clickable.

### Acceptance criteria

- [ai] Test: a needs-input card renders no "Details" link, and clicking the blurb still opens the details.
- [ai] Test: the blurb is reachable by keyboard (Enter/Space opens the details) and has an accessible name.
- [ai] Check other cards that use the same blurb component (held, error, human-step) so none keep a stray "Details" link, and list what you found in the handoff report.
- [ai] Declared `## Shots`: the board with a needs-human-step card, using a `state` fixture; highlight the blurb.

### Notes for AI

Find the card component by grepping for the "Details" label and the `NEEDS HUMAN STEP` text under `src/ui-app/src/components/`. No bespoke colors: use existing tokens; the contrast audit and hardcoded-colors guard must pass.

## E2 · Task-card agent hover popover: rows open the agent editor on click

### Problem

Hovering the robot (AI) icon on a task card shows a popover listing the PM, Engineer and Reviewer agent and model. Clicking the icon itself opens the agent editor, but the rows in the hover popover are not clickable, so the user has to move to the icon and click it instead.

### Desired UX

Each popover row (PM, Engineer, Reviewer) is clickable and opens the same agent editor the icon click opens, for that role if the editor supports focusing a role (otherwise just opens it). Rows show a pointer cursor and a hover/focus state, are keyboard focusable, and moving the mouse from the icon into the popover does not close it before the click.

### Acceptance criteria

- [ai] Test: clicking each row opens the same editor as the icon click, focused on that role if supported.
- [ai] Test: rows are keyboard operable (Tab to focus, Enter/Space activates) and have accessible names (role, agent, model).
- [ai] The popover still closes as it does today (delay, click-away); it stays open while the pointer is over it. Interacts with the auto-close delay from #1036 E2: keep that behavior working.
- [ai] Uses the shared popover/tooltip pattern (body-teleported layer carries `data-overlay-layer`), no native `title` tooltips, no bespoke colors.
- [ai] Declared `## Shots`: the board with the popover open (hover step on the AI icon), highlight the rows.

### Notes for AI

Find the popover by grepping for "Reviewer" and the robot icon in `src/ui-app/src/components/` (task card). Reuse the handler the icon's click already calls.

## Shots
```json
[
{
"label": "Needs-human-step card blurb without Details link",
"target": "default",
"route": "/",
"highlight": "[data-task-id=\"9999\"] [data-test-id=\"task-card-needs-input-detail\"]",
"state": "card:humanStep"
},
{
"label": "Agent hover popover with clickable rows",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"task-agent-preview\"] tbody tr",
"steps": [
{
"hover": "[data-task-id=\"9999\"] .tc-agent-btn"
},
{
"waitMs": 400
}
],
"state": "card:humanStep"
}
]
```

## Screenshots

![Task card: needs-human-step blurb with redundant Details link](/api/tasks/1040/attachments/att_05cfe9bc-bf21-47d7-81e2-e6441010ab59.png)
![Agent popover rows (compact)](/api/tasks/1040/attachments/att_ac85825f-2f48-40b9-bdbf-40e73126b042.png)
![Agent popover on hover: PM, Engineer, Reviewer rows](/api/tasks/1040/attachments/att_762cb0d2-a0bb-4e0e-a21f-240d925cd002.png)

## Activity

- 2026-11-05T11:41:20Z · created · njachowski@gmail.com
- 2026-11-05T11:41:21Z · screenshots
- 2026-11-05T14:38:37Z · cli_override
- 2026-11-05T14:38:40Z · cli_override
- 2026-11-05T14:38:41Z · cli_override
- 2026-11-06T01:51:13Z · status inbox→ready
- 2026-11-06T01:51:15Z · status ready→active, branch
- 2026-11-06T01:58:39Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: off. · stderr: muse: workspace root: /Users/nick/code/nick/repoos-worktrees/feat/easter-eggs-bundle-card-details-link-and (cwd default) muse: workspace trust: trusted source=run-flag muse: warning: rules file at /Users/nick/code/nick/repoos-worktrees/feat/easter-eggs-bundle-card-details-link-and/CLAUDE.md is ignored this session bec…
- 2026-11-06T02:10:03Z · CTO nudge: held — handoff gate is running
- 2026-11-06T02:15:31Z · body
- 2026-11-06T02:15:33Z · message_queued at 2026-11-06T02:15:33.941Z
- 2026-11-06T02:33:05Z · message_queued at 2026-11-06T02:33:05.484Z
- 2026-11-06T02:35:03Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-06T02:40:06Z · message_delivered: 2 message(s)
- 2026-11-06T02:40:07Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-06T02:45:03Z · CTO nudge: held — handoff gate is running
- 2026-11-06T03:08:27Z · note: ui verification failed (5 issue(s)): [missing-target] Needs-human-step card blurb without Details link (target "default"): state "card:humanStep" did not render on target "default" — / shows no task card (http://127.0.0.1:60860/?shotState=card%3AhumanStep); [missing-target] Needs-human-step card blurb without Details link (target "default"): highlight [data-test-id="task-card-needs-input-detail"] matched nothing on / (http://127.0.0.1:60860/?shotState=card%3AhumanStep); [missing-target] Agent ho
- 2026-11-06T03:08:27Z · message_queued at 2026-11-06T03:08:27.469Z
- 2026-11-06T03:14:41Z · CTO nudge: held — handoff gate is running
- 2026-11-06T03:39:46Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-11-06T03:48:02Z · agent exited with an error (muse) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T03:48:32Z · engineer crash recovery: resuming muse + muse-spark-1.3 (1/12 crashes in 30m) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T03:48:34Z · needs_input
- 2026-11-06T03:48:40Z · agent exited with an error (muse) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T03:49:40Z · engineer crash recovery: resuming muse + muse-spark-1.3 (2/12 crashes in 30m) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T03:49:43Z · needs_input
- 2026-11-06T03:49:52Z · agent exited with an error (muse) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T03:51:22Z · engineer crash recovery: resuming muse + muse-spark-1.3 (3/12 crashes in 30m) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T03:51:26Z · needs_input
- 2026-11-06T03:51:37Z · agent exited with an error (muse) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T03:53:37Z · engineer crash recovery: resuming muse + muse-spark-1.3 (4/12 crashes in 30m) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T03:53:40Z · needs_input
- 2026-11-06T03:53:49Z · agent exited with an error (muse) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T03:56:19Z · engineer crash recovery: resuming muse + muse-spark-1.3 (5/12 crashes in 30m) · run ended with Failed: transport error: error sending request for url (https://api.meta.ai/v1/responses) (after 4 provider attempts)
- 2026-11-06T03:56:21Z · needs_input
- 2026-11-06T03:57:29Z · agent exited with an error (muse) · received SIGTERM; flushed session logs
- 2026-11-06T03:57:29Z · engineer crash recovery: surfaced instead of switching — a human-set task override (muse + muse-spark-1.3) is pinned, so RepoOS did not replace it (6/3 crashes in 30m)
- 2026-11-06T04:02:29Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-06T04:16:01Z · watchdog: restarting engineer after 11m with no live process
- 2026-11-06T04:16:05Z · message_overdue: still queued after 60m without being delivered
- 2026-11-06T04:16:06Z · message_delivered: 1 message(s)
- 2026-11-06T04:19:15Z · body
- 2026-11-06T04:21:11Z · body
- 2026-11-06T04:28:15Z · CTO nudge: held — handoff gate is running
- 2026-11-06T04:42:15Z · note: ui verification failed (2 issue(s)): [missing-target] Agent hover popover rows open the editor (target "default"): hover button.tc-agent-btn: hover: Timeout 5000ms exceeded. on /work (http://127.0.0.1:62027/work?shotState=card%3AhumanStep); [missing-target] Agent hover popover rows open the editor (target "default"): highlight [data-test-id="task-agent-preview"] tbody tr matched nothing on /work (http://127.0.0.1:62027/work?shotState=card%3AhumanStep)
- 2026-11-06T04:42:15Z · message_queued at 2026-11-06T04:42:15.753Z
- 2026-11-06T04:42:18Z · message_delivered: 1 message(s)
- 2026-11-06T04:48:15Z · CTO nudge: held — remote validation is running
- 2026-11-06T04:52:37Z · body
- 2026-11-06T04:54:15Z · body
- 2026-11-06T04:57:20Z · body
- 2026-11-06T04:57:20Z · message_queued at 2026-11-06T04:57:20.630Z
- 2026-11-06T04:58:15Z · CTO nudge: held — handoff gate is running
- 2026-11-06T05:00:16Z · body
- 2026-11-06T05:02:31Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-06T05:02:31Z · message_queued at 2026-11-06T05:02:31.742Z
- 2026-11-06T05:02:31Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Scoped check green ("All checks passed"). Requesting handoff so server finalization re-runs UI verification on the corrected shots. · stderr: muse: workspace root: /Users/nick/code/nick/repoos-worktrees/feat/easter-eggs-bundle-card-details-link-and (cwd default) muse: workspace trust: trusted source=run-flag
- 2026-11-06T05:02:32Z · message_delivered: 2 message(s)
- 2026-11-06T05:04:26Z · body
