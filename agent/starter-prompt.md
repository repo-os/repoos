# Get started with RepoOS

Help me set up RepoOS for a new project or an existing repo.

Before you change anything:

1. Read https://repoos.org/llms.txt. It is the short overview: what RepoOS is, who it is for, and the verified install commands.
2. Inspect this repository before installing or editing anything. Run `git status`, `git remote -v`, and `git log -1 --oneline`. Check whether RepoOS is already installed (`command -v repoos`) and whether the repository is already initialized (`AGENTS.md`, `repoos/work/`, `repoos/docs/`, or `repoos.toml`).
3. Only if that overview is not enough, read the docs index at https://docs.repoos.org/llms.txt and follow only the pages you need.

Then:

- Tell the owner what you found, including whether RepoOS is already installed or initialized.
- If RepoOS is not installed, choose the install method that fits this machine: curl is the zero-dependency default, and Homebrew, npm, Bun, pnpm, and mise are also supported. Ask before running a global install.
- Before editing, preserve existing files and uncommitted Git changes. Do not reset, clean, or commit someone else's work.
- Run `repoos init` in the repository root only after the owner agrees. It scaffolds `repoos/work/`, `repoos/docs/`, and `AGENTS.md` by default and touches nothing else.
- Explain what changed, and ask before any significant edit outside the RepoOS scaffold.

Do not invent files, commands, or flags. If something is not in the RepoOS overview, the docs, or `repoos --help`, say so rather than guessing.
