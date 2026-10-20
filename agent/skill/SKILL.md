---
name: repoos
description: Explain RepoOS and help set it up in an existing Git repository. Use when the user asks about RepoOS, wants a repo-native task board that coding agents can work, or points you at a repository that already has a repoos.toml file or a repoos/ directory.
license: FSL-1.1-MIT
---

# RepoOS

RepoOS keeps a project's task board in the repository itself. Tasks are Markdown
files with their status in YAML frontmatter, coding agents work them in isolated
Git worktrees, and a person reviews and approves every merge. It is local-first
and has no hosted service behind it.

This skill is for a coding agent that is **outside** RepoOS — the user pointed
you at a repository, or asked what RepoOS is. Read the smallest reference that
answers the question; do not fetch the whole manual first.

## Inspect before you change anything

Run these first and report what you found:

```bash
command -v repoos          # is the CLI installed?
repoos --version           # which version, if it is
git status --short         # is the checkout already dirty?
git remote -v
git log -1 --oneline
test -f repoos.toml && echo "RepoOS already initialized"
```

`repoos.toml` at the repository root is the marker that a repository is already
initialized. The scaffolded directories live under `repoos/` by default (root
`work/` and `docs/` on a root-layout install) — read the configured `workDir`
and `docsDir` from `repoos.toml` instead of assuming either layout.

Ask before a global install, and before any significant edit outside the RepoOS
scaffold. Never reset, clean, stash, or commit the user's unrelated work.

## Read next

- [What RepoOS does](references/what-repoos-does.md) — concepts, statuses, and
  the human/agent split.
- [Detect and install](references/detect-and-install.md) — the six supported
  install commands and how to tell whether RepoOS is already present.
- [Initialize and layout](references/init-and-layout.md) — `repoos init`, the
  default namespaced layout, and the non-interactive new-project flags.
- [Tasks and stories](references/tasks-and-stories.md) — `repoos new`,
  `repoos story`, and how to discover every command and flag.
- [Leave unrelated Git changes alone](references/git-safety.md) — the staging
  and revert rules an outside agent must follow.

## Ground rules

- Do not invent files, commands, or flags. If a fact is not in this skill, the
  docs, or `repoos --help`, say so instead of guessing.
- Discover the current CLI with `repoos --help` and `repoos <command> --help`;
  the [CLI reference](https://docs.repoos.org/cli) is the browsable equivalent.
- Inspect first, preserve existing files and uncommitted changes, and ask before
  significant edits.
- RepoOS writes task files itself. Use `repoos new`, `repoos update`,
  `repoos mv`, and `repoos note` rather than editing `work/*.md` by hand.

## Learn more

- [https://repoos.org/llms.txt](https://repoos.org/llms.txt) — short overview
  and verified install commands.
- [https://docs.repoos.org/llms.txt](https://docs.repoos.org/llms.txt) — the
  docs index; ask for `llms-full.txt` only when a page is not enough.
- [Getting started](https://docs.repoos.org/getting-started) and
  [running with agents](https://docs.repoos.org/running-with-agents) — the
  human guide, then the later operating loop.
- Public source of this skill:
  [https://github.com/repo-os/repoos/tree/main/agent/skill](https://github.com/repo-os/repoos/tree/main/agent/skill)
