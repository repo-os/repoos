---
id: "0951"
title: "Use the full window height on every page: content scrolls down to the bottom edge, with a fade-out where floating controls need to stay visible"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/use-the-full-window-height-on-every-page
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-24T22:51:41Z"
updated_at: "2026-10-25T08:58:56Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-25T02:49:43.139Z: repoos check failed: ◆ Check plan"
last_handoff_failure_fingerprint: "check|the worktree changed while the gate was running (HEAD moved from eec677ba to d74e9b93) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
last_handoff_failure_sha: eec677bac89c446145383d0d176ce86853f65c62
review_passes: 1
handoff_signal_retry_count: 1
dev_error_count: 6
---
## Problem

On most pages the main content area stops short of the bottom of the window. The left sidebar runs all the way down, but the page content is cut off by a hard edge well above the window bottom, leaving a band of empty background (see Work, Stories, Checks, Releases, Deployments, Agents, Context and Settings: cards are clipped mid-way at a line, with unused space beneath). This wastes vertical space and looks like a layout bug. `.main` in `src/ui-app/src/style.css` is `flex: 1; overflow-y: auto; padding: 22px 26px 60px`, so find which ancestor or sibling is limiting its height (shell height calc, a reserved bottom bar, the integration-pipeline pill on Work, the floating agent heads) rather than assuming.

## Desired UX

Every standard nav page uses the full window height: the scrollable content area extends to the bottom edge, like the sidebar does. Content scrolls under the bottom edge. Where something must stay visible and clickable at the bottom (the Work page's "Human / Archived" and integration-pipeline controls, the floating agent heads), keep it floating on top and give the area behind it a subtle fade-out or blur so text underneath stays readable and the controls stay easy to see and hit. There must be enough end-of-scroll padding that the last card is never hidden behind a floating control. No visible cut line or empty band anywhere.

## Acceptance criteria

- [ ] On Control, Inputs, Work, Stories, Checks, Releases, Deployments, Dev, Secrets, Agents, Context and Settings the scrollable page area reaches the bottom of the window (verify at two or three window heights), with no empty band or hard clip line beneath the content.
- [ ] The last item on every page can be scrolled fully into view and is not covered by a floating control.
- [ ] Work page: the bottom controls stay visible and clickable, with a fade or blur behind them; no content is unreachable.
- [ ] The floating agent heads do not cover essential controls (check the bottom right on every page); keep their position or add a safe inset.
- [ ] One shared mechanism (a CSS variable or utility for the bottom fade and bottom inset), not per-page hacks; works in all themes and light/dark, passes the contrast audit and `hardcoded-colors` guard (use theme tokens).
- [ ] Mobile or narrow widths still work, and pages that are intentionally centered or narrow (login/auth, modals) are unchanged.
- [ ] Declare `## Shots` for at least Work, Stories and Checks at a tall and a short viewport, and look at them yourself.
- [ ] Update tests and any docs that describe the layout; follow the AGENTS.md "pages use the full main width" convention.

## Notes for AI

- Check how this interacts with #0949 (page scrolling, which pinned headers) and with #0950 (skeleton loaders; it edits the same view files and style.css, so keep your edits small and merge main often).
- Do not add runtime dependencies.

## Shots
```json
[
{
"label": "Work page at tall viewport",
"target": "default",
"route": "/work",
"highlight": ".work-page"
},
{
"label": "Work page at short viewport",
"target": "default",
"route": "/work",
"highlight": ".work-page"
},
{
"label": "Stories page at tall viewport",
"target": "default",
"route": "/stories",
"highlight": ".stories-page"
},
{
"label": "Stories page at short viewport",
"target": "default",
"route": "/stories",
"highlight": ".stories-page"
},
{
"label": "Checks page at tall viewport",
"target": "default",
"route": "/checks",
"highlight": ".ck-page"
},
{
"label": "Checks page at short viewport",
"target": "default",
"route": "/checks",
"highlight": ".ck-page"
}
]
```

## Activity

- 2026-10-24T22:51:41Z · created · njachowski@gmail.com
- 2026-10-24T22:52:12Z · status inbox→ready
- 2026-10-24T22:52:19Z · cli_override, model_override
- 2026-10-24T22:52:20Z · status ready→active, branch
- 2026-10-24T22:54:10Z · body
- 2026-10-24T22:56:55Z · body
- 2026-10-24T22:58:13Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-24T23:32:01Z · body
- 2026-10-24T23:42:36Z · body
- 2026-10-24T23:54:16Z · handoff failed · check failed after 2 automatic retries · the worktree changed while the gate was running (HEAD moved from 671525a3 to 4a029553) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable.
- 2026-10-24T23:56:07Z · note: handoff requested (ui-review)
- 2026-10-25T00:06:12Z · handoff failed · ui-review handoff failed at check · the worktree changed while the gate was running (HEAD moved from bd41edf4 to c1705145) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable.
- 2026-10-25T00:11:34Z · note: handoff requested (ui-review)
- 2026-10-25T00:22:57Z · handoff failed · ui-review handoff failed at check · the worktree changed while the gate was running (HEAD moved from 7e92eb4d to d02d7a0c) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable.
- 2026-10-25T00:29:50Z · note: handoff requested (ui-review)
- 2026-10-25T00:45:07Z · note: ui verification passed: 3 of 6 shots captured with clean console
- 2026-10-25T00:45:08Z · status active→review
- 2026-10-25T00:46:25Z · note: review pass 1: needs some work
- 2026-10-25T00:47:32Z · status review→active
- 2026-10-25T00:47:32Z · note: send-back — returned to active for engineer follow-up
- 2026-10-25T00:47:33Z · message_queued at 2026-10-25T00:47:33.988Z
- 2026-10-25T00:47:35Z · CTO nudge: held — remote validation is running
- 2026-10-25T00:47:56Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T00:47:56Z · status active→review
- 2026-10-25T00:47:57Z · message_delivered: 1 message(s)
- 2026-10-25T00:47:57Z · note: handoff requested (cli)
- 2026-10-25T00:48:20Z · CTO nudge: held — handoff gate is running
- 2026-10-25T00:49:28Z · body
- 2026-10-25T00:49:46Z · body
- 2026-10-25T00:51:42Z · body
- 2026-10-25T00:56:35Z · body
- 2026-10-25T00:57:58Z · handoff failed · task-file handoff failed at check · the worktree changed while the gate was running (HEAD moved from eec677ba to d74e9b93) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable.
- 2026-10-25T01:28:26Z · message_queued at 2026-10-25T01:28:26.025Z
- 2026-10-25T01:31:55Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T01:32:09Z · body
- 2026-10-25T01:39:59Z · agent exited with an error (codex) · 2026-10-25T01:39:57.861759Z ERROR codex_core::session: failed to record rollout items: thread 01a170ac-5ad0-7e71-9e8e-d1abd26933d6 not found
- 2026-10-25T01:39:59Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · 2026-10-25T01:39:57.861759Z ERROR codex_core::session: failed to record rollout items: thread 01a170ac-5ad0-7e71-9e8e-d1abd26933d6 not found
- 2026-10-25T01:40:03Z · message_delivered: 1 message(s)
- 2026-10-25T01:40:13Z · engineer crash recovery: resuming codex + gpt-6-luna (2/3 crashes in 30m) · Reading additional input from stdin...
- 2026-10-25T01:40:25Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-25T01:47:27Z · cli_override, model_override
- 2026-10-25T01:47:57Z · needs_input
- 2026-10-25T01:47:58Z · message_queued at 2026-10-25T01:47:58.189Z
- 2026-10-25T01:50:20Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T01:58:19Z · body
- 2026-10-25T02:03:01Z · body
- 2026-10-25T02:07:45Z · body
- 2026-10-25T02:09:15Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-25T02:09:15Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T02:09:16Z · message_delivered: 1 message(s)
- 2026-10-25T02:11:55Z · CTO nudge: held — remote validation is running
- 2026-10-25T02:26:55Z · CTO nudge: held — remote validation is running
- 2026-10-25T02:42:51Z · body
- 2026-10-25T02:49:39Z · watchdog: escalated to needs_input · check-failed-after-retries · check failed after 2 automatic retries · the worktree changed while the gate was running (HEAD moved from 671525a3 to 4a029553) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-25T02:52:09Z · body
- 2026-10-25T03:01:55Z · message_queued at 2026-10-25T03:01:55.618Z
- 2026-10-25T03:01:55Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T03:03:30Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T03:15:56Z · body
- 2026-10-25T03:17:50Z · body
- 2026-10-25T04:12:21Z · message_overdue: still queued after 60m without being delivered
- 2026-10-25T04:38:07Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Connection failed repeatedly
- 2026-10-25T04:38:17Z · message_delivered: 1 message(s)
- 2026-10-25T04:38:22Z · engineer crash recovery: resuming cursor + composer-2.5 (2/3 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-10-25T04:38:28Z · engineer crash recovery: surfaced instead of switching — a human-set task override (cursor + composer-2.5) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-25T05:07:45Z · cli_override, model_override
- 2026-10-25T05:30:35Z · needs_input
- 2026-10-25T05:30:58Z · status active→ready
- 2026-10-25T05:31:06Z · status ready→active
- 2026-10-25T06:06:44Z · message_queued at 2026-10-25T06:06:44.812Z
- 2026-10-25T06:06:45Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T06:07:29Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T08:50:43Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T08:50:44Z · message_delivered: 1 message(s)
- 2026-10-25T08:50:56Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T08:53:34Z · body
- 2026-10-25T08:58:54Z · message_queued at 2026-10-25T08:58:54.096Z
- 2026-10-25T08:58:56Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
