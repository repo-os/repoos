---
id: "0868"
title: "Driver playbook in the repo: move the hard-won driver lessons out of scratch notes"
type: chore
status: inbox
priority: p2
area: docs
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-20T12:06:07Z"
updated_at: "2026-10-20T12:06:07Z"
---
## Problem
AGENTS.md says durable project knowledge belongs in the repo, but the lessons from driving RepoOS on 2026-10-19/20 live only in a scratch handoff file under /private/tmp, which disappears with the session. A new driver has to relearn them: reviews and messages race (a message queues and the engineer hands off before reading it); how to repair a phantom runner (`repoos mv <id> ready` then `repoos start <id>`); review whack-a-mole (give one message naming the class); a crashed engineer needs --needs-input false, a model switch and full context; the machine thrashes mostly because of non-RepoOS processes; run landing pre-checks separately from `repoos done`; ask before deleting unknown untracked files on main.

## Desired UX
A new driver reads docs/driver-playbook.md, linked from the Interactive/external sessions section of AGENTS.md, and gets: the command cheat sheet, the landing pre-checks, how to give an engineer a class-level fix message, failure triage (needs_input reasons, crashes, phantom runners, stale evidence), load triage commands, and the rules about unknown files on main. Items that are later fixed by tasks (#0863 phantom runners, #0865 review chaining, #0866 shot targets, the landable command) are marked "until fixed by #NNNN".

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
