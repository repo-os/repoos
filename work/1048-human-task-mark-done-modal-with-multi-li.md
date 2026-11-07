---
id: 1048
title: "Human task Mark done: modal with multi-line completion report"
type: feature
status: active
human_step_decision: agent
human_step_decision_key: 26944cd9
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/human-task-mark-done-modal-with-multi-li
created_at: "2026-11-07T00:56:19Z"
updated_at: "2026-11-07T16:42:28Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-07T16:29:03.114Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
---
## Problem

On a human-assigned task the drawer's "Mark done" strip has a single-line
`<Input>` for the optional completion note (`humanCompletionNote` in
`src/ui-app/src/components/TaskDrawer.vue`, the `drawer-human-task` notice).
A real human report (what was tested, on what device, what was observed, what
was *not* verified) does not fit on one line; the text scrolls sideways and is
unreadable. Found closing out a verification task from the divot repo (a
lid-close keep-awake test with a multi-paragraph result), but any
needs-human-step task has the same need.

## Desired UX

- "Mark done" on a human task opens a confirm **modal** instead of using the
inline note input (remove the inline input).
- Modal: title "Mark done", short description, an optional **5-6 line
`<textarea>`** labelled "Completion report (optional)" that keeps newlines,
and Cancel / Mark done buttons. An empty report is allowed.
- The report is stored in the same field the single-line note uses today, but
must round-trip multi-line text and markdown through the task-file
writer/parser (no frontmatter or body breakage) and display readably in the
drawer afterwards.
- If the status dropdown can also move a human task to done via
`setStatus('done')`, keep both paths consistent.
- Built from the shared dialog components in
`src/ui-app/src/components/ui/dialog/` and the global `ff-*`/`field`/
`btn-row` classes in `style.css`; no bespoke scoped modal CSS, no native
`confirm()`/`prompt()`.

## Acceptance criteria

Modal quality (a recurring problem, do not skip):

- Correct padding on all sides of content and footer; buttons not flush to the
edges or to each other.
- Both buttons have full-size, reliably clickable hit areas (nothing overlaps
them or sits above them). Cancel, Mark done, the close X and Escape all work;
clicking the scrim cancels without submitting.
- Rendered through the dialog portal with `data-overlay-layer`, so it is not
click-transparent or trapped in the drawer's stacking context.
- Focus lands in the textarea, Tab reaches both buttons, Cmd/Ctrl+Enter
submits. Usable at narrow/touch widths.
- A UI/component test clicks both buttons with real clicks (not by calling the
handler), and a `## Shots` entry captures the open modal.

Behavior:

- A multi-line report survives save, reload and display intact, with a test
for the round-trip.
- Marking done with an empty report still works.

## Notes for AI

- Start from the `drawer-human-task` block around line 5336 of
`TaskDrawer.vue` and the `humanCompletionNote` / `setStatus` code.
- Look at an existing dialog built on `components/ui/dialog/` for the layout
pattern, and check how other dialogs get their padding and footer buttons
right before writing new CSS.
- Check the zero-runtime-dependency rule; no new packages.

## Shots
```json
[
{
"label": "Human task completion report modal",
"target": "default",
"route": "/work?task=1048&tab=changes",
"highlight": ".human-done-modal",
"steps": [
{
"click": ".drawer-human-task button"
}
],
"state": "card:humanStep"
}
]
```

## Activity

- 2026-11-07T00:56:19Z · created · njachowski@gmail.com
- 2026-11-07T00:56:21Z · needs_input
- 2026-11-07T00:56:34Z · body: Problem (added 2, removed 2); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Change (removed); Modal quality bar (recurring problem: do not skip) (removed); Done when (removed)
- 2026-11-07T00:56:35Z · needs_input
- 2026-11-07T14:05:33Z · status inbox→ready
- 2026-11-07T15:01:52Z · status ready→active, branch
- 2026-11-07T15:06:28Z · body
- 2026-11-07T15:23:41Z · message_queued at 2026-11-07T15:23:41.834Z
- 2026-11-07T15:23:42Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T15:25:45Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T15:29:03Z · body
- 2026-11-07T15:38:59Z · body
- 2026-11-07T15:44:22Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Implemented the human-task **Mark done** modal, routed both completion paths through it, and preserved multiline Markdown reports in task activity. The UI, writer/parser, and note tests pass. The final `REPOOS_CHECK_CHANGED=main repoos che… · stderr: Reading additional input from stdin... 2026-11-07T15:43:21.607808Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 97564
- 2026-11-07T15:44:23Z · message_delivered: 1 message(s)
- 2026-11-07T15:44:34Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Blocked on the required open-modal screenshot declaration. The available `repoos update 1048 --shots` command targets the main checkout’s board, which you marked off-limits. The implementation and changed-path check are complete and green,… · stderr: 2026-11-07T15:43:21.607808Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 97564
- 2026-11-07T15:48:41Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T15:49:24Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Blocked on declaring the required open-modal `## Shots` entry. `repoos update 1048 --shots` resolves the main checkout’s board, which you marked off-limits, so I can’t use it to update task metadata. The worktree is clean, the implementati… · stderr: 2026-11-07T15:43:21.607808Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 97564
- 2026-11-07T15:51:47Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T15:52:09Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Blocked on the required `## Shots` declaration for the open modal. The available `repoos update 1048 --shots` command targets the main checkout’s board, which is off-limits for this task. The worktree is clean, and the scoped check passed … · stderr: 2026-11-07T15:43:21.607808Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 97564
- 2026-11-07T15:53:41Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T15:53:54Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Blocked on the required `## Shots` entry. The only available declaration command reads and updates the main checkout’s board, which you marked off-limits; hand-editing the task file is also prohibited by the repo instructions. The scoped c… · stderr: 2026-11-07T15:43:21.607808Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 97564
- 2026-11-07T15:58:41Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T16:01:55Z · CTO nudge: held — handoff gate is running
- 2026-11-07T16:29:00Z · message_queued at 2026-11-07T16:29:00.001Z
- 2026-11-07T16:31:00Z · message_delivered: 1 message(s)
- 2026-11-07T16:33:41Z · CTO nudge: held — remote validation is running
- 2026-11-07T16:42:19Z · body
- 2026-11-07T16:42:28Z · note: ui verification failed (2 issue(s)): [missing-target] Human task completion report modal (target "default"): click .drawer-human-task button: click: Timeout 5000ms exceeded. on /work?task=1048&tab=changes (http://127.0.0.1:64409/work?task=1048&tab=changes&shotState=card%3AhumanStep); [missing-target] Human task completion report modal (target "default"): highlight .human-done-modal matched nothing on /work?task=1048&tab=changes (http://127.0.0.1:64409/work?task=1048&tab=changes&shotState=card%3A
