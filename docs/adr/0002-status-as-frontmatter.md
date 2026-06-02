---
status: accepted
date: 2026-05-29
deciders: nick
---

# 0002 — Status is a frontmatter field, not a folder

## Status

Accepted.

## Context

Given that tasks are files under `work/` (ADR-0001), a task's lifecycle state
(inbox / ready / active / review / done) has to live somewhere. Two options:

- Encode status in the file's *location* — move the file between
  `work/inbox/`, `work/active/`, etc. as it progresses. Intuitive and visible
  in the file tree.
- Encode status as a `status:` *field in the frontmatter*. The file never
  moves; its location is irrelevant to its state.

The forces: in an AI-native workflow, multiple writers (a human and one or more
agents) may change task state concurrently. Moving files on every transition
generates churn in git history and creates merge conflicts when two writers
touch the queue. It also means an agent must know the folder convention to find
or update a task. A frontmatter field keeps the file stable, makes state a
simple field edit, and confines concurrency conflicts to the single task being
edited rather than the shared queue.

## Decision

Status is the `status:` frontmatter field. Files never move between folders to
represent state. Board columns are a `group by status` over the index.

## Consequences

Positive:

- No git churn or merge conflicts from state transitions.
- Two writers editing *different* tasks never conflict (separate files).
- Agents change state with a one-field edit; no folder convention to learn.

Costs we accept:

- The file tree no longer visually communicates status; you need `ros list` or
  the UI to see the board. Acceptable — the tooling provides that view.
- Same-file concurrent edits still need care; handled by re-reading before
  write (see the server's safe-write layer).

## Related

Builds on ADR-0001. The concurrency reasoning here is realized in the Stage 2
server's safe-write design.
