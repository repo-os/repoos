---
id: "0860"
title: "Close-out and layout: reminders/ and schedules/ are server-written bookkeeping, and follow the repoos/ layout"
type: bug
status: active
priority: p2
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-and-layout-reminders-and-sched
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-20T04:20:16Z"
updated_at: "2026-10-20T07:08:30Z"
handoff_signal_retry_count: 1
last_check_failure: "repoos check at 2026-10-20T06:20:53.646Z: repoos check failed: ◆ Check plan"
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
"highlight": "[data-config-key=\"remindersDir\"]"
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
