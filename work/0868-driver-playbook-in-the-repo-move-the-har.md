---
id: "0868"
title: "Driver notes: append the 2026-10-19/20 driving lessons to docs/driver-notes.md (and point drivers at repoos driver brief)"
type: chore
status: active
priority: p2
area: docs
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/driver-notes-append-the-2026-10-19-20-dr
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T12:06:07Z"
updated_at: "2026-10-21T00:31:12Z"
---
## Problem
AGENTS.md says durable project knowledge belongs in the repo, but the lessons from driving RepoOS on 2026-10-19/20 live only in a scratch handoff file under /private/tmp, which disappears with the session. A new driver has to relearn them: reviews and messages race (a message queues and the engineer hands off before reading it); how to repair a phantom runner (`repoos mv <id> ready` then `repoos start <id>`); review whack-a-mole (give one message naming the class); a crashed engineer needs --needs-input false, a model switch and full context; the machine thrashes mostly because of non-RepoOS processes; run landing pre-checks separately from `repoos done`; ask before deleting unknown untracked files on main.

## Desired UX
`docs/driver-notes.md` already exists as the append-only log for whoever drives the board (format: dated entries, "what happened, what I did, what RepoOS could do better, with evidence"), and `repoos driver brief [--json]` generates the live board state. The lessons from 2026-10-19/20 are added there as dated entries, not in a new playbook file: reviews and messages race; phantom runner repair (`repoos mv <id> ready` then `repoos start <id>`); review whack-a-mole (one message naming the class); a crashed engineer needs `--needs-input false`, a model switch and full context; machine thrashing mostly from non-RepoOS processes; run the landing pre-checks separately from `repoos done`; ask before deleting unknown untracked files on main. A new driver starts with `repoos driver brief` plus this file and needs no hand-written handoff document.

## Acceptance criteria
- docs/driver-notes.md gains dated entries (one per lesson or a small number grouped by theme) in the existing format, each with evidence (task ids, commands, numbers).
- Each entry that a task will later obsolete names that task (#0863 phantom runners, #0865 review chaining, #0866 shot target validation, #0867 landable, #0869 crash handling, #0871 memory pressure) as "until fixed by #NNNN".
- AGENTS.md gets at most a one-line pointer to `repoos driver brief` and docs/driver-notes.md if it does not already say so; no copy of the notes.
- Docs only; no code. `repoos check` passes.

## Notes for AI
Read docs/driver-notes.md (the format and the 2026-10-07 entry) and docs/cto-autopilot.md first; the brief (`repoos driver brief --json`) is generated from live state, so do not duplicate state in prose, only judgement calls and sharp edges. Source for the lessons: the activity logs of #0843, #0854, #0860 and #0861 and, if available, the previous driver's handoff notes (ask Nick for the text if the scratch path is gone). Do not duplicate AGENTS.md rules; link to them.


## Activity

- 2026-10-20T12:06:07Z · created · njachowski@gmail.com
- 2026-10-20T12:20:16Z · title
- 2026-10-20T12:20:23Z · body: Desired UX (added 1, removed 1)
- 2026-10-20T12:20:29Z · body: Acceptance criteria (added 4, removed 5)
- 2026-10-20T12:20:34Z · body: Notes for AI (added 1, removed 1)
- 2026-10-21T00:31:00Z · status inbox→ready
- 2026-10-21T00:31:10Z · cli_override, model_override
- 2026-10-21T00:31:12Z · status ready→active, branch
