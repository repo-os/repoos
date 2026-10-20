---
id: "0868"
title: "Driver notes: append the 2026-10-19/20 driving lessons to docs/driver-notes.md (and point drivers at repoos driver brief)"
type: chore
status: inbox
priority: p2
area: docs
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-20T12:06:07Z"
updated_at: "2026-10-20T12:20:23Z"
---
## Problem
AGENTS.md says durable project knowledge belongs in the repo, but the lessons from driving RepoOS on 2026-10-19/20 live only in a scratch handoff file under /private/tmp, which disappears with the session. A new driver has to relearn them: reviews and messages race (a message queues and the engineer hands off before reading it); how to repair a phantom runner (`repoos mv <id> ready` then `repoos start <id>`); review whack-a-mole (give one message naming the class); a crashed engineer needs --needs-input false, a model switch and full context; the machine thrashes mostly because of non-RepoOS processes; run landing pre-checks separately from `repoos done`; ask before deleting unknown untracked files on main.

## Desired UX
`docs/driver-notes.md` already exists as the append-only log for whoever drives the board (format: dated entries, "what happened, what I did, what RepoOS could do better, with evidence"), and `repoos driver brief [--json]` generates the live board state. The lessons from 2026-10-19/20 are added there as dated entries, not in a new playbook file: reviews and messages race; phantom runner repair (`repoos mv <id> ready` then `repoos start <id>`); review whack-a-mole (one message naming the class); a crashed engineer needs `--needs-input false`, a model switch and full context; machine thrashing mostly from non-RepoOS processes; run the landing pre-checks separately from `repoos done`; ask before deleting unknown untracked files on main. A new driver starts with `repoos driver brief` plus this file and needs no hand-written handoff document.


## Acceptance criteria
- docs/playbook exists and is linked from AGENTS.md and docs/README.md.
- Covers each lesson above with the exact commands.
- Each entry that a task will later obsolete names the task.
- AGENTS.md gains only a link and at most a few lines, not a copy.
- Docs-only; no code changes. repoos check passes.

## Notes for AI
Source of truth for the lessons: the previous driver's handoff file (ask Nick for its text if the path is gone) and the activity logs of #0843, #0854, #0860 and #0861. Keep it procedural and short. Do not duplicate AGENTS.md rules; link to them.

## Activity

- 2026-10-20T12:06:07Z · created · njachowski@gmail.com
- 2026-10-20T12:20:16Z · title
- 2026-10-20T12:20:23Z · body: Desired UX (added 1, removed 1)
