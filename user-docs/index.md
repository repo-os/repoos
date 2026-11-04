---
layout: home

hero:
  name: 'RepoOS'
  text: The repo is the operating system.
  tagline: Your AI dev team, living in your repo, for CTOs and builders.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: CLI reference
      link: /cli
    - theme: alt
      text: Configuration
      link: /configuration

features:
  - title: Install into any repo
    details: RepoOS isn't a hosted service or a place you move your work to. Run repoos init inside a repo you already have. The default layout adds repoos.toml, repoos/work/, repoos/docs/, AGENTS.md, .env.example, .gitignore, and repoos/.repoos/canary.txt. You can choose another layout during setup.
    link: /getting-started
    linkText: Install and initialize
  - title: Tasks are files, status is a field
    details: Every task is a markdown file in your configured task directory (repoos/work/ on a fresh install), with its status in YAML frontmatter — inbox, ready, active, review, done. Edited in place, versioned by git, no board database to lose.
    link: /concepts
    linkText: How tasks work
  - title: Agents work in isolation
    details: Each task gets its own git worktree and branch. Agents run there, never in your primary checkout, and nothing merges until checks pass and you approve it.
    link: /concepts
    linkText: The task lifecycle
  - title: Local-first, zero lock-in
    details: Runs on your machine. Source-available, zero runtime dependencies. Your tasks are markdown in your repo, with no hosted board database to export or migrate.
    link: /configuration
    linkText: Configure it
---

<ReleaseLine />

## Try it now

Three commands, inside a repo you already have:

<div class="install-command install-command--group">

::: code-group

```bash [curl]
curl -fsSL https://repoos.org/install | bash
```

```bash [brew]
brew install repo-os/tap/repoos
```

```bash [npm]
npm install -g @repo-os/repoos
```

```bash [bun]
bun add -g @repo-os/repoos
```

```bash [pnpm]
pnpm add -g @repo-os/repoos
```

:::

</div>

```bash
repoos init    # default layout: repoos.toml, repoos/work/, repoos/docs/, AGENTS.md, .env.example, .gitignore, repoos/.repoos/canary.txt
repoos serve   # local server plus background agents — check [[agents]] first
```

`repoos init` seeds a real starter task (as an `inbox` suggestion, not work to
auto-run), so the board is never empty on first run — read it and follow along,
no agent required. Runs on Bun or Node 20+. No account, no telemetry.

<AgentPromptCta />

Next: the full [Getting started](/getting-started) walkthrough, or jump
straight to the [CLI reference](/cli).
