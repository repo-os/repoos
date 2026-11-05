---
id: 1026
title: "Easter eggs bundle: init template paths, serve banner, CLI docs and empty-repo edge cases"
type: chore
status: done
priority: p2
area: [core, docs]
merged_commit: c555f07c9669590ab3e01a35529a1f7bcf3b776b
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-init-template-paths-s
cli_override: cursor
model_override: composer-2.5
review_model_override: grok-4.7-low
created_at: "2026-11-04T06:45:41Z"
updated_at: "2026-11-05T00:03:34Z"
last_close_out_gate_ms: 864754
last_close_out_gate_at: "2026-11-05T00:02:10.636Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-04T23:30:06.243Z: repoos check failed: reused check inputs changed during handoff — run the check again"
review_passes: 2
review_rounds: 1
---
## Items
- E1 · Generated AGENTS.md template references nonexistent paths
- E2 · `serve` banner and docs: say which interfaces are bound
- E3 · cli.md missing commands
- E4 · Empty-repo git edge cases
- E5 · Quieter `repoos list` with no server
- E6 · Doc and message accuracy nits
- E7 · Flag underspecified schedule templates on save

Each item below has the same parts: Problem, Desired UX, Acceptance criteria, Notes for AI. Edit one item at a time with `--section`; never resend the whole body.


## E1 · Generated AGENTS.md template references nonexistent paths

### Problem

`repoos init`'s template (src/commands/init.ts ~L211, ~L335) cites RepoOS-internal paths such as `docs/agent-process-safety.md` and `src/core/shot-plan.ts` (6 in total), so `repoos doctor` warns on a brand-new project.

### Desired UX

A fresh `repoos init` project passes `repoos doctor` with no warnings.

### Acceptance criteria

- [ai] Test: init a temp project and assert doctor reports no missing-path warnings.

### Notes for AI

Strip RepoOS-internal paths from the template; link docs.repoos.org URLs where a reference is useful. This edits the `repoos init` template, not this repo's AGENTS.md.

## E2 · `serve` banner and docs: say which interfaces are bound

### Problem

`serve` binds 127.0.0.1 by default but 0.0.0.0 when Tailscale is detected (src/commands/serve.ts ~L72-91), advertises the Tailscale IP with an HTTPS warning, while docs call it a local server.

### Desired UX

The startup banner states the bound interface; docs explain that Tailscale detection widens the bind and that `--host 127.0.0.1` forces localhost.

### Acceptance criteria

- [ai] Test: banner text for both the Tailscale and plain branches.

### Notes for AI

Behavior is intentional; do not change the default bind.

## E3 · cli.md missing commands

### Problem

cli.md lacks `repoos uninstall`, `repoos service` and `--version`.

### Desired UX

All three are documented.

### Acceptance criteria

- [ai] Test: assert each command name appears in the CLI docs.

### Notes for AI

Match the existing cli.md format.

## E4 · Empty-repo git edge cases

### Problem

In a git-init'd repo with no commits: `repoos status` says "git: not a git repository"; the first `repoos new` prints "commit failed" even with identity set via env vars; the `init --new` identity warning ignores env-var identity (GIT_AUTHOR_*/GIT_COMMITTER_*). `new` auto-commits and this is undocumented.

### Desired UX

Repo and identity detection are correct in a zero-commit repo and with env-var identity; auto-commit is documented.

### Acceptance criteria

- [ai] Test: zero-commit repo and env-var identity fixtures for status, new and init --new.

### Notes for AI

Likely one shared cause in repo/identity detection; check before fixing three times.

## E5 · Quieter `repoos list` with no server

### Problem

With no server running, `repoos list` prints a long "Can't reach the RepoOS server…" warning before the board.

### Desired UX

One short line, then the board.

### Acceptance criteria

- [ai] Test: output snapshot.

### Notes for AI

Keep the actionable hint (how to start the server).

## E6 · Doc and message accuracy nits

### Problem

`repoos check` references `user-docs/check.md` instead of a URL; docs say "no board database" but serve creates gitignored `.repoos/repoos.db`.

### Desired UX

The message links a docs URL; the docs sentence is accurate.

### Acceptance criteria

- [ai] Test: string assertions on both.

### Notes for AI

Source: external QA report on v0.5.75, items 3, 4, 13-18.

## E7 · Flag underspecified schedule templates on save

### Problem

A schedule's body is the template for every task it creates. If it lacks Problem, Acceptance criteria and Notes for AI, every run creates a task that is flagged `underspecified` and sits waiting for input. This happened on 2026-11-04: schedule #0012 ("worktree cleanup") created #1008 with only Purpose and Runbook sections, and nobody noticed until the task showed up as needing input. The check runs only when a task is created, long after the schedule was saved.

### Desired UX

Saving a schedule (create or update) runs the same underspecified check the board uses on the template body, with the template's area and assignee, and shows a warning listing the missing sections. The Scheduled Tasks card shows a small warning badge while the template is incomplete. It is advisory: saving is still allowed. `repoos schedule new` and `repoos schedule update` print the same warning.

### Acceptance criteria

- [ai] Test: saving a schedule with an incomplete template body returns a warning naming the missing sections; a complete body returns none.
- [ai] Test: a template assigned to a human is not flagged, matching how the board treats human tasks.
- [ai] Test: the Scheduled Tasks card shows the badge for an incomplete template and not for a complete one.
- [ai] Test: the CLI prints the warning on `schedule new` and `schedule update`.

### Notes for AI

Reuse `assessTaskUnderspecified` in `src/core/task-underspecified.ts`; pass the template's `task_area` and `task_assigned_to`. Save paths are `createSchedule` / `updateSchedule` in `src/core/schedule.ts` and the routes in `src/server/routes/schedules.ts`; keep the existing hard validation errors as they are and add the warning as a separate, non-blocking field. Keep it to that: if it grows beyond a warning field plus a badge, split it into its own task. Source: Nick, 2026-11-05, after #1008.

## Shots
```json
[
{
"label": "Schedule card template incomplete badge and detail row",
"target": "default",
"route": "/agents?tab=scheduled",
"highlight": "[data-testid=\"schedule-template-warn\"]",
"state": "agents:scheduledSeeded"
}
]
```

## Screenshots

![3](/api/tasks/1026/attachments/att_7f4494fa-3f9a-4412-9743-b2405629c23b.png)
![4](/api/tasks/1026/attachments/att_a4a037d3-36a5-4f1e-ae9e-5c4c86ada329.png)
![5](/api/tasks/1026/attachments/att_a3aec7c8-61bc-4ef5-9f11-ace9ee36014d.png)

## Activity

- 2026-11-04T06:45:41Z · created · njachowski@gmail.com
- 2026-11-04T06:45:42Z · needs_input
- 2026-11-04T06:45:56Z · body: Items (added 3, removed 2); E1 · Generated AGENTS.md template references nonexistent paths (added 8, removed 3); E2 · `serve` banner and docs: say which interfaces are bound (added); E3 · cli.md missing commands (added 8, removed 3); E4 · Empty-repo git edge cases (added 8, removed 3); E5 · Quieter `repoos list` with no server (added 8, removed 3); E6 · Doc and message accuracy nits (added); E2 · `serve` banner/docs (removed); E6 · Doc/message accuracy nits (removed); Notes for AI (removed)
- 2026-11-04T06:46:01Z · needs_input
- 2026-11-04T12:58:41Z · body: Items (added 1)
- 2026-11-04T12:58:42Z · body: E7 · Hold dialog styling, optional reason, and held-card padding (added)
- 2026-11-04T12:58:43Z · screenshots
- 2026-11-04T13:13:56Z · body: Items (removed 1); E7 · Hold dialog styling, optional reason, and held-card padding (removed)
- 2026-11-04T15:51:19Z · body: Items (added 1)
- 2026-11-04T15:51:20Z · body: E7 · Task-card agent popover auto-closes after a configurable delay (added)
- 2026-11-04T17:57:42Z · body: E7 · Task-card agent popover auto-closes after a configurable delay (removed 11)
- 2026-11-04T17:57:49Z · body: Items (added 1, removed 1)
- 2026-11-04T17:58:02Z · body: E7 · Flag underspecified schedule templates on save (added); E7 · Task-card agent popover auto-closes after a configurable delay (removed)
- 2026-11-04T18:35:52Z · status inbox→ready
- 2026-11-04T21:17:26Z · cli_override
- 2026-11-04T21:17:27Z · model_override
- 2026-11-04T21:17:31Z · review_model_override
- 2026-11-04T21:17:34Z · status ready→active, branch
- 2026-11-04T21:30:05Z · message_queued at 2026-11-04T21:30:05.970Z
- 2026-11-04T21:30:06Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T21:32:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T22:03:52Z · body
- 2026-11-04T22:14:19Z · body
- 2026-11-04T22:20:05Z · CTO nudge: held — handoff gate is running
- 2026-11-04T22:34:37Z · status active→review
- 2026-11-04T22:34:38Z · message_queued at 2026-11-04T22:34:38.106Z
- 2026-11-04T22:37:12Z · note: review pass 1: needs some work
- 2026-11-04T22:37:13Z · message_delivered: 1 message(s)
- 2026-11-04T22:37:13Z · status review→active
- 2026-11-04T22:37:16Z · CTO nudge: held — remote validation is running
- 2026-11-04T22:49:44Z · body
- 2026-11-04T22:55:05Z · CTO nudge: held — handoff gate is running
- 2026-11-04T23:07:44Z · message_queued at 2026-11-04T23:07:44.065Z
- 2026-11-04T23:10:05Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T23:15:09Z · message_delivered: 1 message(s)
- 2026-11-04T23:15:10Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-04T23:15:54Z · body
- 2026-11-04T23:25:05Z · message_queued at 2026-11-04T23:25:05.839Z
- 2026-11-04T23:25:06Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T23:25:17Z · body
- 2026-11-04T23:27:42Z · body
- 2026-11-04T23:27:56Z · status active→review
- 2026-11-04T23:29:40Z · note: review pass 2: good to go
- 2026-11-04T23:30:03Z · message_queued at 2026-11-04T23:30:03.014Z
- 2026-11-04T23:30:06Z · message_delivered: 1 message(s)
- 2026-11-04T23:39:50Z · body
- 2026-11-04T23:41:57Z · message_queued at 2026-11-04T23:41:57.005Z
- 2026-11-05T00:02:10Z · close-out gate completed in 865s
- 2026-11-05T00:03:34Z · status done→done, release:success
