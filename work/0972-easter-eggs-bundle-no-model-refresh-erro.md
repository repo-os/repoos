---
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
updated_at: "2026-10-28T08:34:47Z"
---
## Items

- E1 · Agents page: no model-refresh error for an agent that is not installed (reported by Nick, 2026-10-28)
- E2 · Task drawer status card: fix padding, drop the info tooltip, open Debug › Status details on click, keep it to 3 lines; cap the Status details cards at 250px (reported by Nick, 2026-10-28)

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
