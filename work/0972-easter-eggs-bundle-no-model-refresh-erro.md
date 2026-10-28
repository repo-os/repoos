---
check_retry_count: 2
last_check_failure: "repoos check at 2026-10-28T15:28:48.538Z: repoos check failed: rendered-contrast — [pressure] swap in/out 2.0 MB/s over 18.257 s (limit 1.0 MB/s) — holding new work until paging eases. Check Activity Monitor (Memory tab), `vm_stat 1`, or `memory_pressure -Q` on macOS; `/proc/pressure/memory` and `vmstat 1` on Linux.; system load is high (3.6× per CPU, limit 3×) — waiting for headroom before starting more work"
id: "0972"
title: "Easter eggs bundle: uninstalled-agent model notice, task status card"
type: bug
status: active
priority: p3
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-uninstalled-agent-mod
cli_override: cursor
model_override: grok-4.7-low
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-10-28T08:00:32Z"
updated_at: "2026-10-28T13:33:36Z"
handoff_signal_retry_count: 2
dev_error_count: 1
---
## Items

- E1 · Agents page: no model-refresh error for an agent that is not installed (reported by Nick, 2026-10-28)
- E2 · Task drawer status card: fix padding, drop the info tooltip, open Debug › Status details on click, keep it to 3 lines; cap the Status details cards at 250px (reported by Nick, 2026-10-28)
- E3 · App-wide loading: replace the centered spinner with a page skeleton (reported by Nick, 2026-10-28)

## E1 · No model-refresh error for an uninstalled agent

### Problem
After Nick uninstalled Kiro on purpose, the Agents page shows "kiro: Couldn't refresh models (kiro-cli not found on PATH) — showing your saved list." with a Retry button. An agent that was installed and was then removed is not an error.

### Desired UX
An agent whose CLI is not on PATH shows no failed/stale model notice and no Retry. At most it shows a muted "Not installed" state, the same as any other undetected agent. Real probe failures for an installed CLI (timeouts, a bad exit) still show the notice.

### Acceptance criteria
- The models probe in `src/core/models.ts` reports "not on PATH" as a distinct not-installed result, not a generic error.
- `modelNoticeFor` in `src/ui-app/src/stores/config.ts` returns `null` (or a non-error state) for a not-installed CLI, including when a saved list exists.
- Test: a stale saved list plus a not-installed probe gives no "Couldn't refresh models" notice; an installed CLI whose probe fails still gives the notice.

### Notes for AI
The string comes from `modelNoticeFor` (`stores/config.ts`, around line 325). The "<cli> not found on PATH" errors are produced in `src/core/models.ts` (e.g. kiro at about line 456). Also check why an uninstalled CLI is probed at all: `agentsMeta.clis` may list every supported CLI instead of the detected ones.

## E2 · Task drawer status card: 3 lines, click to Debug › Status details

### Problem
The single status card above the task drawer's tabs ("Checks running · Changed-path (changed:…) · Running checks… · on thinkpad · step 10 of 12 · tests 20/610 files") has wrong padding. It also has an (i) info button whose hover tooltip is transparent: the tabs show through the text, so it can't be read (screenshot 1). In the second screenshot the card has a different height and shows "step —". Separately, the cards in Debug › Status details have no height limit, so some are very tall and need a lot of scrolling.

### Desired UX
- The status card uses the same padding and spacing as the other drawer cards, in every theme.
- No (i) button and no tooltip. The whole card is clickable (a button/link with keyboard focus and a visible focus ring) and opens the Debug tab on its Status details sub-tab.
- The card is always exactly 3 lines, so it doesn't jump in height as the state changes. It should look designed, and the 3 lines should tell the user whether to click for more:
1. Title + state: e.g. "Checks running", with the running/pass/fail indicator.
2. What it is: scope and where, e.g. "Changed-path vs 9f3f0ca · on thinkpad".
3. Progress or result: e.g. "Step 10 of 12 · tests 20/610 files", or the failing step / reason when it failed. Use "Starting…" instead of "step —".
Truncate each line with an ellipsis rather than wrapping.
- In Debug › Status details, each card is at most 250px tall and scrolls inside itself when its content is longer.

### Acceptance criteria
- The status card has no info button or tooltip, is 3 lines in every state (running, starting, passed, failed), and its padding matches the drawer's card styles.
- Clicking the card, or pressing Enter/Space on it, switches to Debug › Status details (`/work?task=<id>&tab=debug` plus the sub-tab).
- Status details cards have `max-height: 250px` with internal scroll.
- Tests: the card renders 3 lines for the running and failed states, and clicking it selects the Debug tab's Status details sub-tab.
- Declare `## Shots` for the drawer with a running check, and for Debug › Status details.

### Notes for AI
The card lives in `src/ui-app/src/components/TaskDrawer.vue` ("Open Status details" text; see also `DoneErrorCard.vue`). Status details is in `src/ui-app/src/components/DebugPanel.vue`. Use the shared tokens and classes in `style.css`; no hard-coded colors (the `hardcoded-colors` guard). Both screenshots are attached.

## E3 · App-wide loading shows a spinner, not a skeleton

### Problem
After a server restart, /work shows a lone spinner in an empty main pane. The pages were moved to skeleton loaders, but `App.vue` still renders `<div v-if="repo.loading" class="spin">` in `.main` while the repo loads, so every route shows the spinner before its own skeleton.

### Desired UX
While the repo loads, `.main` shows a skeleton shaped like the route being opened: board columns for /work, rows for list pages, using `PageSkeleton.vue` (add a `board` kind if needed). No spinner anywhere in the main pane.

### Acceptance criteria
- `App.vue` no longer renders `.spin` for `repo.loading`; it renders a skeleton, picked per route.
- /work during loading shows column-shaped skeleton cards.
- Test: with `repo.loading` true, the main pane contains `.page-skeleton` and no `.spin`.

### Notes for AI
`src/ui-app/src/App.vue` around line 135; `src/ui-app/src/components/PageSkeleton.vue`. Use the shared tokens; no hard-coded colors.

## Shots
```json
[
{
"label": "Task drawer status card stays three lines while checks run",
"target": "default",
"route": "/work?task=9999",
"highlight": ".drawer-status-summary",
"state": "drawer:statusChecksRunning"
},
{
"label": "Debug Status details cards scroll inside a 250px cap",
"target": "default",
"route": "/work?task=9999&tab=debug",
"highlight": ".debug-status-detail",
"state": "drawer:statusDetails"
}
]
```

## Screenshots

![6](/api/tasks/0972/attachments/att_3546c1e8-226d-4a09-aff5-fa37f8185073.png)
![7](/api/tasks/0972/attachments/att_8f0fd187-e38e-45b7-b42f-0c84b0a82baa.png)

## Activity

- 2026-10-28T08:00:32Z · created · njachowski@gmail.com
- 2026-10-28T08:23:04Z · review_cli_override
- 2026-10-28T08:23:07Z · review_model_override
- 2026-10-28T08:33:06Z · title, body: Items (added 1); E2 · Task drawer status card: 3 lines, click to Debug › Status details (added)
- 2026-10-28T08:33:07Z · screenshots
- 2026-10-28T08:33:32Z · cli_override, model_override
- 2026-10-28T08:34:02Z · status inbox→ready
- 2026-10-28T08:34:47Z · status ready→active, branch
- 2026-10-28T08:49:57Z · watchdog: auto-surfaced stuck task · status active→ready · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-10-28T08:51:19Z · status ready→active
- 2026-10-28T08:56:29Z · message_queued at 2026-10-28T08:56:29.011Z
- 2026-10-28T09:01:44Z · message_queued at 2026-10-28T09:01:44.058Z
- 2026-10-28T09:09:17Z · body
- 2026-10-28T09:18:37Z · body: Items (added 1); E3 · App-wide loading shows a spinner, not a skeleton (added)
- 2026-10-28T09:18:42Z · message_queued at 2026-10-28T09:18:42.265Z
- 2026-10-28T09:18:43Z · message_queued at 2026-10-28T09:18:43.824Z
- 2026-10-28T09:48:45Z · phantom runner detected: no live process, restarted
- 2026-10-28T09:48:45Z · note: phantom runner detected: no live process, restarted
- 2026-10-28T09:48:54Z · message_delivered: 4 message(s)
- 2026-10-28T11:10:20Z · note: adopted orphaned engineer pid 29103
- 2026-10-28T11:25:55Z · body
- 2026-10-28T11:42:24Z · agent exited with an error (cursor) · RetriableError: Connection failed repeatedly
- 2026-10-28T11:42:24Z · engineer crash recovery: resuming cursor + grok-4.7-low (1/3 crashes in 30m) · RetriableError: Connection failed repeatedly
- 2026-10-28T11:44:32Z · body
- 2026-10-28T11:51:19Z · needs_input
- 2026-10-28T11:51:20Z · message_queued at 2026-10-28T11:51:20.133Z
- 2026-10-28T12:17:09Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-28T12:17:10Z · message_delivered: 1 message(s)
- 2026-10-28T13:33:36Z · note: ui verification failed (1 issue(s)): [missing-target] Debug Status details cards scroll inside a 250px cap (target "default"): highlight .debug-status-detail matched nothing on /work?task=9999&tab=debug (http://127.0.0.1:60126/work?shotState=drawer:statusDetails)


