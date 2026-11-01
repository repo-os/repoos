---
id: "0999"
title: Keep automatic watchdog bookkeeping from blocking close-out
type: bug
status: inbox
priority: p1
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-01T11:58:54Z"
updated_at: "2026-11-01T11:58:54Z"
---
## Problem
Automatic watchdog bookkeeping in a tracked task file can dirty main while another task is trying to close out. On 2026-11-01, #0994 accumulated automatic check-wait escalation/recovery activity entries on main.   #0994 is not landable yet
  ✓ Review verdict — latest review pass is "good to go"
  ! Review lock — no review lock for this task
      next: Hand the task off to review so the reviewed commit is locked
  ✓ Worktree clean — worktree is clean
  ! Merge with main — only this task's own work/0994-worktree-creation-must-survive-a-slow-ch.md conflicts with main — close-out resolves it from main
      next: No action needed; close-out takes main's copy of the task file
  ✓ Task scope — diff changes 6 files, all within this task
  ✗ Main clean — main has 2 uncommitted files: repoos.toml (repoos.toml), work/0994-worktree-creation-must-survive-a-slow-ch.md (unknown)
      next: Commit or stash them on main, then retry Move to done
3 passed · 2 warnings · 1 failing then failed Main clean, and the same main-clean failure blocked #0998. These are RepoOS-generated status records, not source edits, but the current guard treats them as blocking user work.

## Desired behavior
Durable task status and activity remain available, while narrowly identified machine-generated bookkeeping does not strand unrelated close-outs. Human-authored task edits, source changes, unknown metadata, and invalid task files must keep blocking with a precise explanation. No broad exemption for , no silent staging of unrelated paths, and no publication of a candidate different from the validated tree.

## Acceptance criteria
- Reproduce automatic watchdog activity updates on main while another task is ready to land; close-out remains safe without a manual commit for only those recognized generated entries.
- Human edits to task body/frontmatter, mixed generated and human changes, unrelated source WIP, unknown task metadata, and parse failures remain protected and report the exact blocking paths.
- Concurrent task activity and close-out cannot lose updates, stage unrelated files, alter the validated source tree, or publish an unvalidated candidate.
- CLI landability and the actual Move to done pipeline agree; add regression tests and update directly affected close-out/watchdog documentation.

## Notes for AI
Inspect #0693 and #0682 plus , the watchdog/task metadata writers, and close-out staging/publication code. Keep the fix narrow, preserve RepoOS task state as source of truth, and do not commit or auto-checkpoint arbitrary human settings.

## Activity

- 2026-11-01T11:58:54Z · created · njachowski@gmail.com
