---
id: "0715"
title: pi engineer ends turns cleanly without requesting handoff; stderr not surfaced; recovery is slow and the CTO cannot see why
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Acceptance criteria, Notes for AI; body under 400 characters (excluding original prompt)"
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-06T09:14:59Z"
updated_at: "2026-11-04T06:55:57Z"
---
Field report from tuk-private (RepoOS v0.5.66). Source rows in tuk-private/repoos/docs/repoos-feedback.md. Row 31 (3 attempts, no stderr surfaced) and row 33 (a poisoned engineer session keeps failing across harness changes until /start {"mode":"fresh"}, undocumented in the handoff).

## Problem
Two field reports plus a live reproduction on 2026-11-04.

1. tuk-private (RepoOS v0.5.66, rows 31 and 33 of its repoos-feedback.md): a `pi` engineer wrote its prompt and then did nothing across 3 attempts with no stderr surfaced; a poisoned engineer session kept failing across harness changes until `/start {"mode":"fresh"}`, which is undocumented in the handoff.
2. Live repro, task #1016 run on `pi` + `openrouter/deepseek/deepseek-v4.1-flash` (override accepted 04:23Z). The engineer edited 4 files within 2 minutes, then repeatedly exited cleanly without requesting handoff. Timeline from the task Activity: 04:32 CTO completion nudge; 04:37 next nudge held (undelivered message queued); 04:45 "engineer turn ended without a handoff: the turn exited cleanly and did not request review"; 05:38 CTO report "needs an idle-state check" and takes no action (sandbox denied process inspection, "server unavailable"); watchdog auto-resumes at 05:56 (1/3), 06:18 (2/3), 06:47 (2/3 again; the counter did not advance); handoff only requested 06:48, about 2h25m after start. `.repoos/agent-logs/1016.out.log` kept growing the whole time, so the engineer was slow or looping, not dead. The agent kept calling `repoos review 1016` itself, and never ended a turn with the `::repoos-handoff-ready::` line.
3. The CTO ran on codex and could not tell slow from stalled; recent CTO sessions also show "codex agent timed out after 300s".

## Desired UX
When a `pi` engineer ends a turn without requesting handoff, RepoOS tells the human why within one watchdog interval (last assistant text, exit reason, stderr tail), resumes the turn with an explicit handoff instruction, and does not leave the task silently idle for an hour. A poisoned session has a documented one-step recovery (`/start {"mode":"fresh"}` or `repoos start <id> --fresh`) shown in the handoff failure message.


## Activity

- 2026-10-06T09:14:59Z · created · unknown
- 2026-10-06T09:15:00Z · needs_input
- 2026-11-04T06:55:55Z · title, body: Problem (added)
- 2026-11-04T06:55:57Z · body: Desired UX (added)
