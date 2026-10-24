---
id: "0948"
title: "repoos send-back: return a task from review to the engineer with a message in one command"
type: feature
status: active
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-send-back-return-a-task-from-revi
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-24T11:14:00Z"
updated_at: "2026-10-24T11:44:36Z"
---
## Problem

Sending a task back from review to its engineer with feedback takes three separate commands (`repoos mv <id> active`, `repoos start <id>`, `repoos message <id> "<text>"`). `repoos mv ... --note` and `repoos note` only write to the task's activity log and never reach the engineer, which is a trap. Long briefs need shell tricks like `"$(cat file)"`. Drivers and humans repeatedly get the order wrong or skip a step, leaving the task active with no engineer, or the engineer running without the brief.

## Desired UX

`repoos send-back <id> --message "<text>"` or `--message-file brief.txt` (or `-` for stdin) does, in order: move the task from review (or anything non-active that allows it) to active, start or resume the engineer, then queue the message. It prints each step and stops with a clear error naming the step that failed. A matching API route (`POST /api/tasks/:id/send-back` with `{ message }`) performs the same sequence server-side so the UI and CLI share it. `--now` is NOT offered.

## Acceptance criteria

- [ ] `repoos send-back <id> --message-file f` moves review to active, starts the engineer, and queues the message, in that order.
- [ ] A missing or empty message is rejected before anything changes (no half-sent-back task).
- [ ] If starting fails, the task is left in a state the output explains, and the message is not lost silently.
- [ ] `--message-file -` reads stdin; `--json` output matches other control-plane commands.
- [ ] The API route is registered in the CLI/API parity catalog (`src/cli/api-route-parity.ts`) with this command as its CLI counterpart; `repoos mv --note` help text warns it does not message the engineer.
- [ ] Respects the budget allowlist and existing start refusals (paused pair, live engineer, review lock).
- [ ] Tests with fakes for the three steps, the failure-ordering cases, and the empty-message case; `user-docs/cli.md` documents it.

## Notes for AI

- Reuse the existing start and message handlers; do not duplicate their logic.
- Check `docs/close-out-pipeline.md` and the review lock rules before moving a task out of review.

## Activity

- 2026-10-24T11:14:00Z · created · njachowski@gmail.com
- 2026-10-24T11:32:00Z · status inbox→ready
- 2026-10-24T11:32:08Z · cli_override, model_override
- 2026-10-24T11:32:08Z · status ready→active, branch
- 2026-10-24T11:35:56Z · body
- 2026-10-24T11:38:09Z · body
- 2026-10-24T11:40:55Z · body
- 2026-10-24T11:44:36Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
