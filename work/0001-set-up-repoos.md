---
id: "0001"
title: Set up RepoOS
type: chore
status: done
priority: p2
area: infra
assigned_to: ai
created_by: human
branch: ""
updated_at: "2026-10-28T16:31:38Z"
---
## Problem

The repo needs a lightweight, repo-native way to track work that AI agents
and humans share. Tasks should live as markdown files, versioned in git.

## Desired UX

Run `ros list` to see the board. Run `ros show 0001` to read a task.
Agents read these files directly for full context.

## Acceptance criteria

- [ ] `ros init` has scaffolded work/, repoos.toml, AGENTS.md
- [ ] `ros list` shows this task
- [ ] Editing the `status:` field moves it across the board

## Notes for AI

Status is a frontmatter field — never move files between folders. Keep diffs
small. Read AGENTS.md before starting any task.

## Activity

- 2026-05-29T00:00:00Z · created · (migrated)
- 2026-08-23T11:03:13Z · status done→review
- 2026-08-23T11:03:13Z · status review→done
- 2026-10-21T04:25:58Z · body
- 2026-10-21T04:31:02Z · body
- 2026-10-28T16:26:50Z · watchdog: check wait escalated · waiting: the memory compressor is holding 40% of RAM (9.5 GB of RAM) — holding new work until memory pressure eases for 179h 54m · next step: let it finish — the wait clears itself when the check starts running; investigate only if it persists
- 2026-10-28T16:31:38Z · needs_input
