---
title: Using RepoOS with an AI coding agent
description: Hand the RepoOS website to Claude Code, Codex, OpenCode, Cursor, or another compatible agent, and let it inspect the repository, install RepoOS, and initialize it safely.
---

# Using RepoOS with an AI coding agent

If you already work with a coding agent, you don't have to install RepoOS by
hand. Point the agent at this page and give it the starter prompt below. It
reads a short overview first, checks your repository, and asks before it changes
anything. Claude Code, Codex, OpenCode, and Cursor are common examples — nothing
here depends on which agent you use.

This page covers setup. Once RepoOS is installed and initialized,
[Running a project with AI agents](/running-with-agents) covers the operating
loop: planning tasks, choosing models, review, and close-out.

## How the agent reads RepoOS

The public material is built for progressive disclosure, so an agent can start
small and fetch more only when it needs it:

- **A short overview first.** [repoos.org/llms.txt](https://repoos.org/llms.txt)
  explains what RepoOS is, who it is for, and the verified install commands.
- **The docs index next, only if needed.** [docs.repoos.org/llms.txt](/llms.txt)
  lists every page with a link to its raw Markdown. For the whole manual in one
  fetch, use [llms-full.txt](/llms-full.txt).
- **One starter prompt.** The text below is the only copy. Every surface that
  offers to copy it reads the same canonical file, so there is no second version
  to drift.
- **One portable skill.** The
  [RepoOS Agent Skill](https://github.com/repo-os/repoos/tree/main/agent/skill)
  follows the [Agent Skills specification](https://agentskills.io/specification).
  Install that one directory under your agent's own skills location, for
  example `~/.claude/skills/repoos/`. RepoOS publishes no provider-specific
  plugin, branded integration, or per-vendor copy. See the
  [skill page](/agent-skill) for what it covers.

Every page is also plain Markdown at the same route with `.md` appended — for
example [`/getting-started.md`](https://docs.repoos.org/getting-started.md) — so
an agent can fetch the source instead of the rendered HTML.

## The starter prompt

Copy this into your agent. It tells the agent what to read, what to inspect, and
when to ask.

<<< ../agent/starter-prompt.md

## What to expect

- The agent reports whether RepoOS is already installed (`command -v repoos`)
  and whether this repository is already initialized (`repoos.toml`).
- If RepoOS is missing, it picks a method from
  [Install](/getting-started#install) that fits the machine — curl is the
  zero-dependency default, and Homebrew, npm, Bun, pnpm, and mise are also
  supported — and asks before running a global install.
- It runs `repoos init` from the repository root only after you agree. See
  [Initialize a repo](/getting-started#initialize-a-repo) for what that
  scaffolds (`repoos/work/`, `repoos/docs/`, and `AGENTS.md`) and the
  non-interactive flags for a brand-new project.
- It explains what changed, and asks before any significant edit outside the
  RepoOS scaffold.

## Permission guidance

Tell the agent these three rules before it starts; the starter prompt repeats
them so they survive a fresh session:

- **Inspect the repository first.** Run `git status`, `git remote -v`, and
  `git log -1 --oneline` before installing or editing anything. Read what is
  already there instead of assuming an empty project.
- **Preserve existing files and Git changes.** Do not reset, clean, stash, or
  commit someone else's work. `repoos init` never overwrites an existing file:
  it creates only what is missing.
- **Ask before significant edits.** A global install, a change outside the
  RepoOS scaffold, or anything that rewrites project files needs your explicit
  agreement first.

## Keep going

- [Getting started](/getting-started) — install, initialize, and run your first
  task if you would rather do the setup yourself.
- [CLI reference](/cli) — every command and flag the agent may use.
- [Running a project with AI agents](/running-with-agents) — the operating loop
  after setup.
- [RepoOS Agent Skill](https://github.com/repo-os/repoos/tree/main/agent/skill) —
  the portable skill directory, starting at `SKILL.md`.
