---
title: RepoOS Agent Skill
description: "Portable Agent Skill for outside coding agents: [repo-os/repoos agent/skill](https://github.com/repo-os/repoos/tree/main/agent/skill). Start at SKILL.md."
---

# RepoOS Agent Skill

RepoOS publishes one portable [Agent Skill](https://github.com/repo-os/repoos/tree/main/agent/skill)
for coding agents that do not run inside RepoOS. It follows the
[Agent Skills specification](https://agentskills.io/specification): `SKILL.md`
is short, deeper workflows live in `references/`, and its commands and flags
match the installed CLI.

Fetch the directory, or just the raw
[`SKILL.md`](https://raw.githubusercontent.com/repo-os/repoos/main/agent/skill/SKILL.md).
Claude Code, Cursor, Codex, and similar agents install that one directory under
their own skills location (for example `~/.claude/skills/repoos/`); RepoOS does
not keep provider-specific copies.

The skill covers what RepoOS does, how to detect an existing install, the
supported install commands, `repoos init` and the default `repoos/` layout,
where tasks and project docs live, how to discover commands, how to create
tasks and stories, and how to leave unrelated Git changes alone.

For the install and init walkthrough, see
[Getting started](/getting-started); for every command and flag, see the
[CLI reference](/cli).
