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
- Run `repoos init` only after the owner agrees.
  - Existing repo, from the repository root: `repoos init`
  - New project, outside a git repo (do not run `git init` first): `repoos init <name> --new --description "..." --areas web,api --no-launch`

- With the default `repoos/` layout, init creates `repoos.toml`, `repoos/work/` (including `0001-set-up-repoos.md` and an inbox starter task), `repoos/docs/`, `AGENTS.md`, `.env.example`, `.gitignore` (created, or appended when one already exists), and `repoos/.repoos/canary.txt`. A new project also runs `git init` and, unless you pass `--no-commit`, commits the scaffold (`chore: initialize RepoOS project`). Init does not overwrite an existing file. An existing repo is not committed for you.
- Before `repoos serve`, check which agents are enabled in `repoos.toml` (a project with no `[[agents]]` rows uses the built-in defaults). Serve starts the local server and background automation. The CTO board monitor ticks every 5 minutes (`ctoMonitorIntervalMs`, default 300000). When the `cto` agent has `enabled = true`, that tick launches a coding agent. Turn it off with `enabled = false` on that `[[agents]]` row. The built-in default leaves the CTO disabled. The reviewer is on by default and starts when a task enters `review`. The watchdog (`watchdog.enabled`, default true) can restart a stalled engineer.
- Explain what changed, and ask before any significant edit outside the RepoOS scaffold.

Do not invent files, commands, or flags. If something is not in the RepoOS overview, the docs, or `repoos --help`, say so rather than guessing.
