---
id: "0939"
title: Fix keyboard navigation and hints in search bars
type: bug
status: active
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-keyboard-navigation-and-hints-in-sea
created_at: "2026-10-23T16:10:17Z"
updated_at: "2026-10-23T17:57:56Z"
last_check_failure: "repoos check at 2026-10-23T17:28:41.083Z: repoos check failed: remote validation unavailable: ssh upload of candidate bundle to bee failed: [stdin error: EPIPE] — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally"
last_handoff_failure_fingerprint: "check|remote validation unavailable: ssh upload of candidate bundle to bee failed: upload too slow (ETA 1806s exceeds budget) — trying another host or local gate — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally"
last_handoff_failure_sha: 1daffbf8c814c97b9f98f5dfa7d7d0f0a85862ae
---
## Problem

The Context page search bar displays a hint about using the arrow keys and Enter to select a result, but that keyboard interaction does not work. Other search bars, including the main top-bar search, lack a hint, making their keyboard controls unclear.

## Desired UX

Search bars consistently show a relevant hint for keyboard navigation and selection. The advertised Up/Down, Enter, and Escape controls work as expected.

## Acceptance criteria

- [ ] Fix the Context page search so its Up/Down, Enter, and Escape keyboard controls work as advertised.
- [ ] Add a relevant keyboard-controls hint to search bars that do not currently have one, including the main top-bar search.
- [ ] Ensure hints accurately describe the keyboard controls supported by each search bar.

## Notes for AI

- Inspect the existing search bars and their current keyboard behavior before making changes.
- Keep each hint aligned with the controls that search bar actually supports.

## Scope

Covers keyboard navigation and keyboard-control hints for search bars, including the Context page and main top bar.

## Original prompt

I just noticed the hint on one of the search bars (this is the one in context page that has the hint), but the hint to use the arrows and enter to select doesn't actually work at all..can you fix that? and can you add the hint to all the search bars, e.g. the main top bar search bar doesn't have a hint and looks very bare... so yeah, add the relevant hint about the keyboard up/down/enter/esc etc and make sure it actually works.

## Shots
```json
[
{
"label": "Global search keyboard controls",
"target": "default",
"route": "/",
"highlight": ".search-overlay-keyboard-hint",
"steps": [
{
"click": ".search-input"
},
{
"waitMs": 200
}
]
}
]
```

## Screenshots

![Screenshot-2026-10-23-at-23.59.54](/api/tasks/0939/attachments/att_bf7e274a-9e23-4f93-b16f-c1e787e2426b.png)
![Screenshot-2026-10-24-at-00.01.41](/api/tasks/0939/attachments/att_7abd01ec-d5a3-44fc-ba8e-316a438af090.png)

## Activity

- 2026-10-23T16:10:17Z · created · hello@repoos.org
- 2026-10-23T16:10:25Z · screenshots
- 2026-10-23T16:10:26Z · screenshots
- 2026-10-23T16:10:48Z · status draft→inbox, title, area, type, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added)
- 2026-10-23T16:47:28Z · status inbox→ready
- 2026-10-23T16:49:09Z · status ready→active, branch
- 2026-10-23T16:50:47Z · body
- 2026-10-23T16:54:38Z · body
- 2026-10-23T16:57:06Z · body
- 2026-10-23T17:07:41Z · handoff failed · remote validation failed: test failure: tests/search-overlay-context.test.ts > SearchOverlay context scope (#0557) > navigates results with arrows, opens the highlighted result, and closes on Escape on bee — fix it in the feature branch and re-run the gate
- 2026-10-23T17:12:54Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/search-overlay-context.test.ts > SearchOverlay context scope (#0557) > navigates results with arrows, opens the highlighted result, and closes on Escape on bee — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-23T17:12:54Z · note: handoff requested (cli)
- 2026-10-23T17:14:58Z · handoff failed · task-file handoff failed at check · remote validation unavailable: ssh upload of candidate bundle to bee failed: upload too slow (ETA 1806s exceeds budget) — trying another host or local gate — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally
- 2026-10-23T17:21:39Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/search-overlay-context.test.ts > SearchOverlay context scope (#0557) > navigates results with arrows, opens the highlighted result, and closes on Escape on bee — fix it in the feature branch and re-run the gate
- 2026-10-23T17:22:14Z · body
- 2026-10-23T17:30:49Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-23T17:38:14Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/search-overlay-context.test.ts > SearchOverlay context scope (#0557) > navigates results with arrows, opens the highlighted result, and closes on Escape on bee — fix it in the feature branch and re-run the gate
- 2026-10-23T17:39:49Z · body
- 2026-10-23T17:41:52Z · body
- 2026-10-23T17:44:45Z · body
- 2026-10-23T17:57:56Z · note: ui verification passed: 1 of 1 shot captured with clean console
