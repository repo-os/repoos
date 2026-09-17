---
layout: home

hero:
  name: 'RepoOS'
  text: The repo is the operating system.
  tagline: Tasks are markdown files in your repo. AI agents work them in git worktrees. You stay at the sign-off gate.
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
    details: RepoOS isn't a hosted service or a place you move your work to. Run repoos init inside a repo you already have, and it adds work/, docs/, and an AGENTS.md.
    link: /getting-started
    linkText: Install and initialize
  - title: Tasks are files, status is a field
    details: Every task is a markdown file under work/ with its status in YAML frontmatter — inbox, ready, active, review, done. Edited in place, versioned by git, no board database to lose.
    link: /concepts
    linkText: How tasks work
  - title: Agents work in isolation
    details: Each task gets its own git worktree and branch. Agents run there, never on your main checkout, and nothing merges until the check gate is green and you sign off.
    link: /concepts
    linkText: The task lifecycle
  - title: Local-first, zero lock-in
    details: Runs on your machine. Source-available, zero runtime dependencies. Your tasks are markdown in your repo — leaving means deleting one directory.
    link: /configuration
    linkText: Configure it
---

## Try it now

Three commands, inside a repo you already have:

::: code-group

```bash [curl]
curl -fsSL https://repoos.org/install.sh | bash
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

```bash
repoos init    # scaffolds work/, docs/, AGENTS.md — touches nothing else
repoos serve   # opens the board at http://127.0.0.1:7171
```

`repoos init` seeds a real starter task, so the board is never empty on first
run — read it and follow along, no agent required. Runs on Bun or Node 20+.
No account, no telemetry.

Next: the full [Getting started](/getting-started) walkthrough, or jump
straight to the [CLI reference](/cli).
