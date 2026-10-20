---
id: "0860"
title: "Close-out and layout: reminders/ and schedules/ are server-written bookkeeping, and follow the repoos/ layout"
type: bug
status: done
priority: p2
area: server
merged_commit: e06744b42dcef1462a91a24efc7704e5ba05f07f
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-and-layout-reminders-and-sched
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T04:20:16Z"
updated_at: "2026-10-20T23:15:31Z"
last_close_out_gate_ms: 108890
last_close_out_gate_at: "2026-10-20T11:57:00.685Z"
review_passes: 9
review_rounds: 2
handoff_signal_retry_count: 1
last_check_failure: "repoos check at 2026-10-20T06:20:53.646Z: repoos check failed: ◆ Check plan"
dev_error_count: 2
---
## Problem
(1) Close-out blocks on reminder files. Move to done refuses to publish when a reminder file is dirty on main: 'main has 1 uncommitted file at publish time, so the merge would abort: reminders/37fba592-....md'. Reminders (#0851) are server-written, repo-native files like tasks, inputs and stories, but the close-out only knows work/, inputs/ and stories/ as routine server-written churn (bookkeepingDirs / bookkeepingKeepOursPrefixes in src/server/integration-orchestrator.ts ~line 334; isNonCodePublishDrift; the dirty-main guard in docs/close-out-pipeline.md). Every time a reminder is created, snoozed or marked done while a close-out runs, an unrelated landing is blocked and needs a manual 'Commit & continue'. Scheduled-task definitions (schedules/, #0093) are stamped by the server (last_run_at, last_occurrence_key) and have the same problem.

(2) These directories ignore the repoos/ layout. 'repoos init' with the repoos/ namespace writes workDir, docsDir, skillsDir, storiesDir and inputsDir under repoos/ (src/commands/init.ts repoosToml()), but schedulesDir defaults to 'schedules' (src/core/config.ts ~204) and is not set by the template, and reminders is hard-coded as join(config.root, 'reminders') in src/core/reminders.ts with no config key at all. So a repoos/ project gets root-level schedules/ and reminders/ outside its namespace (the same leak field report #0703 fixed for stories/).

## Desired UX
A. A dirty or advancing reminders/ (and schedules/) tree never blocks or restarts a close-out: at publish a dirty file under these dirs is treated as routine server-written churn and auto-checkpointed like dirty work/ inputs/ stories/ files; a conflict in them resolves to main's copy (autoResolveOurs); main advancing only by commits in them counts as non-code drift (no candidate resync). Real dirty source files still block, exactly as today (fail closed).

B. Both directories are configurable and follow the layout: add a remindersDir setting (default 'reminders', with a Settings UI control and getConfigSchema entry per the repo rule) and make src/core/reminders.ts read it instead of the hard-coded path; the close-out bookkeeping dirs come from config (remindersDir, schedulesDir) the way workDir/inputsDir/storiesDir do; the repoos/ template in 'repoos init' also writes schedulesDir = '<ns>/schedules' and remindersDir = '<ns>/reminders' with the other namespaced dirs. Existing projects keep their current paths (no silent move); document how to relocate by setting the keys and moving the files.

## Acceptance criteria
- Tests: a dirty reminders/<id>.md (modified and untracked) on main at publish does not abort the merge and is checkpointed; the same for schedules/*.md; a dirty source file still aborts with the existing message.
- Tests: main advancing only by reminders/ or schedules/ commits is non-code drift (no resync); a conflict in these dirs keeps main's copy.
- Tests: custom remindersDir and schedulesDir values are honoured by the close-out, by the reminders store and by the scheduler.
- Tests: the repoos/ init template writes namespaced schedulesDir and remindersDir; the root layout template is unchanged; an existing config without the new keys behaves exactly as before (default 'reminders').
- remindersDir has a Settings UI control and getConfigSchema entry with clear copy and a test; docs/close-out-pipeline.md, docs/scheduled-tasks.md, user-docs/configuration.md and user-docs/review-and-close-out.md are updated, including the note for existing projects.

## Notes for AI
Extend bookkeepingDirs and its callers rather than adding a parallel list, and check every place that enumerates the three bookkeeping dirs (grep workDir/inputsDir/storiesDir in src/server and src/core). Keep the allowlist semantic and fail-closed (AGENTS.md 'Integration conflicts'). The default for remindersDir stays 'reminders' so existing behaviour is identical. Related: #0851 (reminders), #0093 (schedules), #0703 (the repoos/ layout leak). Do not touch repoos.toml itself. Source: Nick, 2026-10-20.

## Shots
```json
[
{
"label": "Settings with configurable reminders directory",
"target": "default",
"route": "/settings?tab=general",
"highlight": "[data-config-key=\"remindersDir\"]",
"steps": [
{
"click": "#settings-tab-advanced"
},
{
"waitFor": "[data-config-key=\"remindersDir\"]"
}
]
},
{
"label": "Configuration docs for reminders and schedules paths",
"target": "Docs site",
"route": "/configuration",
"highlight": "h2#layout-and-repository-paths"
}
]
```

## Activity

- 2026-10-20T04:20:16Z · created · njachowski@gmail.com
- 2026-10-20T04:26:08Z · title
- 2026-10-20T04:26:10Z · body: Problem (added 2, removed 1)
- 2026-10-20T04:26:12Z · body: Desired UX (added 2, removed 5)
- 2026-10-20T04:26:13Z · body: Acceptance criteria (added 5, removed 4)
- 2026-10-20T04:26:15Z · body: Notes for AI (added 1, removed 1)
- 2026-10-20T04:26:34Z · status inbox→ready
- 2026-10-20T04:26:36Z · cli_override, model_override
- 2026-10-20T04:26:39Z · status ready→active, branch
- 2026-10-20T04:38:49Z · body
- 2026-10-20T04:46:00Z · message_queued at 2026-10-20T04:46:00.799Z
- 2026-10-20T04:46:00Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-20T05:34:14Z · message_delivered: 1 message(s)
- 2026-10-20T05:51:46Z · body
- 2026-10-20T06:20:58Z · message_queued at 2026-10-20T06:20:58.353Z
- 2026-10-20T06:42:02Z · message_queued at 2026-10-20T06:42:02.729Z
- 2026-10-20T06:42:03Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-20T06:54:07Z · message_delivered: 2 message(s)
- 2026-10-20T06:54:31Z · cli_override, model_override
- 2026-10-20T06:54:45Z · status active→ready
- 2026-10-20T06:54:52Z · status ready→active
- 2026-10-20T07:00:32Z · body
- 2026-10-20T07:03:51Z · body
- 2026-10-20T07:06:13Z · note: ui verification failed (2 issue(s)): [console] TypeError: 'text/html' is not a valid JavaScript MIME type for module script 'http://127.0.0.1:59478/settings/index.md?import&t=1792479970731'. (http://127.0.0.1:59478/node_modules/vitepress/dist/client/app/router.js?v=a33402cb); [missing-target] Settings with configurable reminders directory: highlight [data-config-key="remindersDir"] matched nothing on /settings?tab=general (http://127.0.0.1:59478/settings?tab=general)
- 2026-10-20T07:06:14Z · handoff failed · check failed after 2 automatic retries · ui verification failed (2 issue(s)): [console] TypeError: 'text/html' is not a valid JavaScript MIME type for module script 'http://127.0.0.1:59478/settings/index.md?import&t=1792479970731'. (http://127.0.0.1:59478/node_modules/vitepress/dist/client/app/router.js?v=a33402cb); [missing-target] Settings with configurable reminders directory: highlight [data-config-key="remindersDir"] matched nothing on /settings?tab=general (http://127.0.0.1:59478/settings?tab=general)
- 2026-10-20T07:08:30Z · body
- 2026-10-20T07:10:41Z · body
- 2026-10-20T07:11:21Z · note: highlight [data-config-key="remindersDir"] matched nothing on /settings?tab=general
- 2026-10-20T07:13:49Z · body
- 2026-10-20T07:23:02Z · watchdog: escalated to needs_input · check-failed-after-retries · check failed after 2 automatic retries · ui verification failed (2 issue(s)): [console] TypeError: 'text/html' is not a valid JavaScript MIME type for module script 'http://127.0.0.1:59478/settings/index.md?import&t=1792479970731'. (http://127.0.0.1:59478/node_modules/vitepress/dist/client/app/router.js?v=a33402cb); [missing-target] Settings with configurable reminders directory: highlight [data-config-key="remindersDir"] matched nothing on /settings?tab=general (http://127.0.0.1:59478/settings?tab=general) · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-10-20T07:27:55Z · needs_input
- 2026-10-20T07:33:40Z · body
- 2026-10-20T07:34:08Z · note: highlight [data-config-key="remindersDir"] matched nothing on /settings?tab=general
- 2026-10-20T07:41:07Z · body
- 2026-10-20T08:09:08Z · message_queued at 2026-10-20T08:09:08.167Z
- 2026-10-20T08:09:08Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-20T08:09:43Z · note: highlight [data-config-key="remindersDir"] matched nothing on /settings?tab=general
- 2026-10-20T08:10:38Z · note: highlight [data-config-key="remindersDir"] matched nothing on /settings?tab=general
- 2026-10-20T08:11:45Z · body
- 2026-10-20T08:14:25Z · body
- 2026-10-20T08:22:34Z · status active→review
- 2026-10-20T08:22:35Z · note: shots: skipped — 12 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-20T08:24:41Z · note: review pass 1: needs some work
- 2026-10-20T08:24:41Z · message_delivered: 1 message(s)
- 2026-10-20T08:24:41Z · status review→active
- 2026-10-20T08:25:47Z · body
- 2026-10-20T08:28:24Z · body
- 2026-10-20T08:37:37Z · status active→review
- 2026-10-20T08:37:37Z · note: shots: skipped — 14 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-20T08:52:26Z · note: review pass 2: good to go
- 2026-10-20T08:56:28Z · note: review pass 3: good to go
- 2026-10-20T11:08:16Z · status review→active
- 2026-10-20T11:08:32Z · agent exited with an error (codex) · you want shared Git history. They are currently repo-wide, visible to
- 2026-10-20T11:08:32Z · status active→review
- 2026-10-20T11:08:33Z · note: handoff requested (cli)
- 2026-10-20T11:09:36Z · needs_input
- 2026-10-20T11:09:49Z · status active→review
- 2026-10-20T11:09:50Z · note: shots: skipped — 14 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-20T11:11:23Z · note: review pass 4: needs some work
- 2026-10-20T11:13:10Z · note: review pass 5: good to go
- 2026-10-20T11:13:33Z · status review→active
- 2026-10-20T11:13:33Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T11:13:38Z · agent exited with an error (codex) · you want shared Git history. They are currently repo-wide, visible to
- 2026-10-20T11:13:38Z · status active→review
- 2026-10-20T11:13:38Z · note: handoff requested (cli)
- 2026-10-20T11:13:54Z · cli_override, model_override
- 2026-10-20T11:14:04Z · needs_input
- 2026-10-20T11:14:06Z · message_queued at 2026-10-20T11:14:06.532Z
- 2026-10-20T11:14:49Z · status active→review
- 2026-10-20T11:14:49Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (d1a81c5e2) during finalization (#0734)
- 2026-10-20T11:14:50Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (d1a81c5e2) during finalization (#0734)
- 2026-10-20T11:17:28Z · note: review pass 6: needs some work
- 2026-10-20T11:17:28Z · message_delivered: 1 message(s)
- 2026-10-20T11:17:28Z · status review→active
- 2026-10-20T11:21:49Z · body
- 2026-10-20T11:23:05Z · body
- 2026-10-20T11:24:43Z · body
- 2026-10-20T11:33:42Z · status active→review
- 2026-10-20T11:33:43Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (36c63078d) during finalization (#0734)
- 2026-10-20T11:40:47Z · note: review pass 7: needs some work
- 2026-10-20T11:40:47Z · needs_input
- 2026-10-20T11:42:26Z · needs_input
- 2026-10-20T11:42:26Z · status review→active
- 2026-10-20T11:42:26Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T11:44:23Z · body
- 2026-10-20T11:45:34Z · status active→review
- 2026-10-20T11:47:24Z · note: review pass 8: needs some work
- 2026-10-20T11:47:25Z · needs_input
- 2026-10-20T11:51:57Z · needs_input
- 2026-10-20T11:51:57Z · status review→active
- 2026-10-20T11:51:57Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T11:51:59Z · message_queued at 2026-10-20T11:51:59.534Z
- 2026-10-20T11:53:07Z · status active→review
- 2026-10-20T11:53:07Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (e06744b42) during finalization (#0734)
- 2026-10-20T11:53:09Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (e06744b42) during finalization (#0734)
- 2026-10-20T11:54:46Z · note: review pass 9: good to go
- 2026-10-20T11:57:00Z · close-out gate completed in 109s
- 2026-10-20T11:57:33Z · status review→done, release:success
- 2026-10-20T13:13:52Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T15:31:57Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T16:09:58Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T17:21:46Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T18:33:42Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T19:47:06Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T20:10:45Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T21:10:06Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T21:57:02Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T22:12:34Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T23:15:31Z · message_overdue: still queued after 60m without being delivered
