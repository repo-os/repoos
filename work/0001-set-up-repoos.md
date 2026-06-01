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
updated: 2026-05-29
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
