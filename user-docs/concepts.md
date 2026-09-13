# Concepts

## The repo is the source of truth

A task is a markdown file under `work/`. Its status is a field in that file's
YAML frontmatter. There's no board database behind the UI — the UI is a view
over the files, and anything derived (the index, caches) can be deleted and
rebuilt.

This has practical consequences you'll feel immediately:

- Tasks are versioned, diffable and reviewable like code.
- Task history travels with a clone. Nothing lives in a service you can lose
  access to.
- An agent can read the board with `cat`, and your project's context is sitting
  right next to the code it describes.

## Status is a field, not a folder

```yaml
---
id: "0001"
title: Fix the login redirect loop
status: ready
priority: p1
---
```

Tasks move through `inbox → ready → active → review → done` by editing that one
field in place. Files never move between directories, so a status change is a
one-line diff instead of a rename, and two people moving different tasks never
conflict.

::: warning Don't hand-edit task files
Status, activity log and metadata are written by RepoOS so the board stays
consistent. Use `repoos mv`, `repoos update`, `repoos note`, or the UI.
:::

## What each status means

| Status | Meaning |
| --- | --- |
| `inbox` | Captured, not yet specified well enough to act on. |
| `ready` | Specified. An agent (or person) can pick this up as-is. |
| `active` | Being worked, in its own git worktree. |
| `review` | Implementation finished and the check gate is green. Waiting on a human. |
| `done` | Signed off and merged. |

## One task, one worktree

When a task goes active, RepoOS creates a dedicated git worktree and branch for
it. The agent works there — never in your main checkout — so you can keep
working while an agent does, and several tasks can be in flight without
stepping on each other.

## The check gate

```bash
repoos check
```

This is the single bar for "did this break anything?": build staleness, format
and lint, a full build, the test suite, and a headless browser smoke test. An
agent must get it green before handing work back, and it runs again before
anything merges.

Because it's one command with a non-zero exit code on failure, the same gate
works locally, in CI, and inside RepoOS's own close-out pipeline.

## Humans hold the merge

An agent that finishes a task moves it to `review` and **stops**. It does not
merge its own branch, and it can't — the merge happens only when a human moves
the task to `done`.

If a reviewer agent is enabled, it reads the branch diff and writes an advisory
report for that review — findings, edge cases, suggestions. It changes nothing
and it doesn't replace your sign-off; it's there to make your review faster.

## `docs/` is the project's memory

`repoos init` creates a `docs/` directory alongside `work/`. It holds the
context an agent needs to work on *your* project: architecture notes, decisions
and their rationale, incident write-ups, conventions that aren't obvious from
the code.

This matters more than it sounds. An agent starting a task reads `AGENTS.md` and
`docs/` to get oriented — so knowledge you write down once stops being
re-derived, re-litigated, or re-broken on every future task.

::: tip
`docs/` is for building *your* project. The documentation you're reading now —
how to use RepoOS itself — is a separate thing, kept in its own directory in the
RepoOS repo.
:::

## AGENTS.md

`AGENTS.md` is the cross-tool standard for agent instructions, read directly by
Claude Code, Codex, Cursor, Aider, Zed and others. `repoos init` scaffolds one
describing the task lifecycle and the rules of your repo. Add a one-line shim
only if a tool you use ignores it.
