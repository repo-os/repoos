---
id: "0908"
title: "Human-assigned tasks need a real board pathway: move across columns to done without triggering AI, checks or review"
type: feature
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "engineer keeps crashing (3 in 30m): RepoOS already switched this task once (opencode + opencode-go/glm-5.3-flash); it will not chain another automatic switch. Review the crash detail and either fix the environment, change the override, or resume manually."
priority: p2
area: [web, server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/human-assigned-tasks-need-a-real-board-p
cli_override: opencode
model_override: opencode-go/glm-5.3-flash
created_at: "2026-10-21T19:22:55Z"
updated_at: "2026-10-22T02:06:25Z"
dev_error_count: 6
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-22T02:06:11.110Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-22T02:06:13.448Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-22T02:06:15.613Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\",\"at\":\"2026-10-22T02:06:22.060Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\",\"at\":\"2026-10-22T02:06:23.912Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\",\"at\":\"2026-10-22T02:06:25.795Z\",\"kind\":\"dev-error\"}]"
engineer_failover: "{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\"}"
---
## Problem
Tasks assigned to a human (for example #0864 and #0907) have no usable path to done in the UI. The only visible 'hold' signal is the assigned-to-human marker, and a task can't be moved to Done without going through active and review, which start AI work, checks, handoff gates and reviewers that make no sense for a human-only task. The only way to close one today is the CLI: repoos update <id> --hold false and repoos mv <id> done. Human steps (rebuild an image, log CLIs in on runners, record a proof, run a trial) are a normal part of the work and need to be first-class on the board.

## Desired UX
A task assigned to a human flows through the same board columns as any other task, but it is inert: moving it between columns (inbox, ready, active, review, done) only changes its status. It never starts an engineer or reviewer, never runs checks, handoff or close-out gates, never creates a worktree, and is never picked up by dispatch or the CTO. Either the human or an AI driver can move it across the board. Moving to Done is a plain status change with an optional completion note, and the drawer shows a clear 'Human task: no AI will work on this' banner plus a Mark done action.

## Acceptance criteria
- assigned_to: human tasks can be dragged or moved through every column in the UI, and via repoos mv, with no AI, check, review, worktree or close-out side effects, proven by tests (no runner start, no handoff, no gate for a human task moving inbox to done).
- Dispatch, auto-engineering, the CTO and Start/Review/Move-to-done buttons ignore or hide for human tasks; the drawer shows the inert banner and a Mark done action with a completion note.
- Remove the need for a separate hold on human tasks, or make 'hold' and 'assigned to human' one clearly labelled concept in the UI (card badge, filter, tooltip).
- The CLI repoos mv <id> done on a human task needs no --force-not-merged and writes a clear activity entry (who closed it and the note).
- Existing human tasks (#0864, #0907, #0852, #0848, #0794, #0784) keep working; add a migration test if the frontmatter changes.
- Docs: user-docs and AGENTS.md describe the human-task pathway and that AI agents may move them only when the human asked.

## Notes for AI
Do not start without the human. Related rule in AGENTS.md: needs-human-step tasks are split into held human tasks; make that flow first-class. Look at status transitions in src/core and src/server/routes/tasks.ts, the close-out guard in cmdMv (src/commands/tasks.ts), and the board column drag code in src/ui-app.

## Activity

- 2026-10-21T19:22:55Z · created · njachowski@gmail.com
- 2026-10-22T02:05:52Z · status inbox→ready
- 2026-10-22T02:06:07Z · status ready→active, branch
- 2026-10-22T02:06:11Z · agent exited with an error (opencode) · error: Go usage limit exceeded
- 2026-10-22T02:06:11Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · error: Go usage limit exceeded
- 2026-10-22T02:06:13Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · error: Go usage limit exceeded
- 2026-10-22T02:06:15Z · engineer crash recovery: switched opencode + opencode-go/deepseek-v4.1-flash → opencode + opencode-go/glm-5.3-flash after 3/3 crashes in 30m · error: Go usage limit exceeded
- 2026-10-22T02:06:22Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · error: Go usage limit exceeded
- 2026-10-22T02:06:23Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (2/3 crashes in 30m) · error: Go usage limit exceeded
- 2026-10-22T02:06:25Z · engineer crash recovery: surfaced instead of switching — RepoOS already switched this task once (opencode + opencode-go/glm-5.3-flash); it will not chain another automatic switch (3/3 crashes in 30m)
