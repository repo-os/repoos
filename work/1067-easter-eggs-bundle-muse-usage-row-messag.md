---
id: "1067"
title: "Easter eggs bundle: Muse usage row messages and dashboard link, needs-input flag after body fix"
type: chore
status: active
priority: p3
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-muse-usage-row-messag
created_at: "2026-11-08T14:01:07Z"
updated_at: "2026-11-08T18:40:34Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-08T18:29:31.454Z: repoos check failed: ui verification failed (2 issue(s)): [request] HTTP 502 for http://127.0.0.1:36953/api/model-providers/muse/usage (http://127.0.0.1:36953/api/model-providers/muse/usage); [request] Failed to load resource: the server responded with a status of 502 (Bad Gateway) (http://127.0.0.1:36953/api/model-providers/muse/usage)"
handoff_signal_retry_count: 2
---
## Items

- [ ] **E1 · Muse usage row shows Meta's reason and hint when no allowance is returned** (web, server) — `muse usage --json` can return `{"allowance":null,"reason":"server_sent_no_usage","hint":"…"}`; the Model Providers row should say that plainly instead of looking empty.
- [ ] **E2 · Muse "Open dashboard" link points at a docs page** (web) — the row's link is `https://dev.meta.ai/docs/muse-code`, which is documentation, not a usage view. Use a real usage page if one exists, otherwise relabel it as docs.
- [ ] **E3 · A valid body update leaves the "needs input / not fleshed out" flag set** (core) — verify first; fix only if confirmed.

Each item below has the same parts: Problem, Desired UX, Acceptance criteria, Notes for AI. Edit one item at a time with `--section`; never resend the whole body. Add related small fixes as `E4`, `E5` before this bundle starts.

## E1 · Muse usage row shows Meta's reason and hint when no allowance is returned

### Problem
Reported 2026-11-08: the Muse row on Agents > Model providers shows no usage. Running `muse usage --json` on the host returns `allowance: null` with `reason: "server_sent_no_usage"` and a `hint` ("the server sent no usage data for this subscription; this can happen before your first use in a new window"). `fetchMuseUsage` in `src/core/providers/spend.ts` already extracts `reason`/`hint` via `museRefusal`, but the human sees no usage and no clear explanation.

### Desired UX
When Muse returns no allowance, the row shows a short plain sentence ("Muse has no usage data for your subscription yet — this can happen before your first use in a new window") with a Retry action, not a blank or generic error. When windows are returned, the row renders them as today.

### Acceptance criteria
- Test: a `reason`/`hint` response with `allowance: null` renders the hint text in the row with a retry affordance.
- Test: a normal response with windows still renders the windows.
- Test: CLI missing (`ENOENT`) still shows the install and `muse login` message.

### Notes for AI
Check first what the row renders today for the null-allowance response (route `src/server/routes/model-providers.ts` ~line 60, 502 mapping) before changing anything; the fix may be display-only. Do not guess at a Muse data source.

## E2 · Muse "Open dashboard" link points at a docs page

### Problem
`dashboardUrl` for Muse in `src/core/providers/spend.ts` (~line 166) is `https://dev.meta.ai/docs/muse-code`. "Open dashboard" therefore opens documentation, not anything showing usage.

### Desired UX
The link opens a page where the user can see their Muse usage or subscription if Meta has one; if not, the link is labelled "Muse docs" instead of "Open dashboard".

### Acceptance criteria
- The Muse row's link label matches where it goes.
- Test covering the label/URL for Muse.

### Notes for AI
Look for a usage or account page in Muse's own docs or CLI help (`muse --help`, `muse usage --help`) before changing the URL. If none exists, relabel; do not invent a URL.

## E3 · A valid body update leaves the "needs input / not fleshed out" flag set

### Problem
On #1063, after `repoos update <id> --body -` added the missing `## Acceptance criteria` and `## Notes for AI` sections, the drawer kept showing "This task doesn't look fully fleshed out" until `repoos update <id> --needs-input false` was run by hand. The activity log showed `needs_input` set at creation and not cleared by the body update.

### Desired UX
When a body update makes the task pass the underspecified check, the flag clears itself and the drawer banner disappears. A body that still fails keeps the flag.

### Acceptance criteria
- Test: a task flagged underspecified, then updated with a body containing every required section, ends with the flag cleared.
- Test: a body update that is still missing a section keeps the flag.
- Test: a task flagged for another reason (human question, provider failure) is not cleared by a body update.

### Notes for AI
Verify the behaviour first: reproduce with `repoos new` using a short body, then `repoos update --body` with a complete one, and check `repoos show` and the drawer. The check lives in `src/core/task-underspecified.ts`. If the reproduction shows it already clears, drop this item and say so in the report. Note that web-area tasks require `## Desired UX` (`areasRequireDesiredUx`), which is a frequent reason the check still fails.

## Shots
```json
[
{
"label": "Muse usage message and docs link",
"target": "default",
"route": "/agents?tab=providers",
"highlight": ".mp-row[data-provider-id=\"muse\"]"
}
]
```

## Activity

- 2026-11-08T14:01:07Z · created · njachowski@gmail.com
- 2026-11-08T14:28:43Z · status inbox→ready
- 2026-11-08T16:29:52Z · status ready→active, branch
- 2026-11-08T16:34:56Z · message_queued at 2026-11-08T16:34:56.718Z
- 2026-11-08T16:37:05Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T16:42:11Z · message_queued at 2026-11-08T16:42:11.755Z
- 2026-11-08T16:47:24Z · watchdog: auto-surfaced stuck task · status active→ready · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-08T16:49:59Z · status ready→active
- 2026-11-08T16:50:02Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T17:09:47Z · body
- 2026-11-08T17:14:07Z · note: adopted orphaned engineer pid 64467
- 2026-11-08T17:15:06Z · body
- 2026-11-08T17:15:52Z · body
- 2026-11-08T17:16:07Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-11-08T17:16:07Z · message_queued at 2026-11-08T17:16:07.268Z
- 2026-11-08T17:16:07Z · ↻ resuming engineer to read queued message
- 2026-11-08T17:16:07Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code unknown · last assistant: Remote validation has passed, including the scoped test suite, UI smoke test, and contrast audit; the local guards are green too. I’m doing the final handoff prep now, including confirming the task worktree state and leaving the required r… · stderr: Reading additional input from stdin... 2026-11-08T16:53:55.361127Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/easter-eggs-bundle-muse-usage-row-messag/src/core/providers/spend.ts: export interface ModelProvider {
- 2026-11-08T17:16:07Z · message_delivered: 3 message(s)
- 2026-11-08T17:23:44Z · body
- 2026-11-08T17:28:39Z · body
- 2026-11-08T17:34:53Z · body
- 2026-11-08T17:39:06Z · CTO nudge: held — handoff gate is running
- 2026-11-08T17:56:18Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Muse usage message and docs link (target "default"): highlight .mp-row[data-provider-id="muse"] matched nothing on /agents?tab=model-providers (http://127.0.0.1:41839/agents?tab=model-providers)
- 2026-11-08T17:56:18Z · message_queued at 2026-11-08T17:56:18.728Z
- 2026-11-08T17:59:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T18:04:08Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-08T18:04:08Z · note: handoff requested (cli)
- 2026-11-08T18:09:06Z · CTO nudge: held — handoff gate is running
- 2026-11-08T18:10:48Z · message_delivered: 1 message(s)
- 2026-11-08T18:11:01Z · body
- 2026-11-08T18:15:45Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Muse usage message and docs link (target "default"): highlight .mp-row[data-provider-id="muse"] matched nothing on /agents?tab=model-providers (http://127.0.0.1:46107/agents?tab=model-providers)
- 2026-11-08T18:15:45Z · message_queued at 2026-11-08T18:15:45.768Z
- 2026-11-08T18:15:45Z · handoff failed · task-file handoff failed at verify · ui verification failed (1 issue(s)): [missing-target] Muse usage message and docs link (target "default"): highlight .mp-row[data-provider-id="muse"] matched nothing on /agents?tab=model-providers (http://127.0.0.1:46107/agents?tab=model-providers)
- 2026-11-08T18:19:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T18:24:40Z · body
- 2026-11-08T18:25:10Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-08T18:25:11Z · message_queued at 2026-11-08T18:25:11.157Z
- 2026-11-08T18:25:11Z · ↻ resuming engineer to read queued message
- 2026-11-08T18:25:11Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: no assistant message · stderr: (empty)
- 2026-11-08T18:26:25Z · message_delivered: 2 message(s)
- 2026-11-08T18:27:26Z · body
- 2026-11-08T18:28:29Z · CTO nudge: held — handoff gate is running
- 2026-11-08T18:29:28Z · note: ui verification failed: ui verification failed (2 issue(s)): [request] HTTP 502 for http://127.0.0.1:36953/api/model-providers/muse/usage (http://127.0.0.1:36953/api/model-providers/muse/usage); [request] Failed to load resource: the server responded with a status of 502 (Bad Gateway) (http://127.0.0.1:36953/api/model-providers/muse/usage)
- 2026-11-08T18:29:28Z · message_queued at 2026-11-08T18:29:28.437Z
- 2026-11-08T18:29:57Z · message_delivered: 1 message(s)
- 2026-11-08T18:30:01Z · message_queued at 2026-11-08T18:30:01.495Z
- 2026-11-08T18:34:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T18:40:34Z · body
