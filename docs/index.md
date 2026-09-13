---
layout: home

hero:
  name: 'RepoOS'
  text: The repo is the operating system.
  tagline: Tasks, specs, and docs as markdown files in the repo — versioned by git, legible to the agents doing the work, sign-off gated by humans.
  actions:
    - theme: brand
      text: Read the vision
      link: /vision
    - theme: alt
      text: Core concepts
      link: /concepts
    - theme: alt
      text: Architecture
      link: /architecture

features:
  - title: Files are truth
    details: Every task is a markdown file under work/ with its status in YAML frontmatter. Delete the derived cache, lose nothing.
    link: /concepts
    linkText: The three states of data
  - title: Status is a field, not a folder
    details: inbox → ready → active → review → done, edited in place. No board database, no file churn, no merge conflicts.
    link: /adr/0002-status-as-frontmatter
    linkText: Why (ADR-0002)
  - title: Agents are first-class
    details: RepoOS spawns coding agents in per-task git worktrees, streams their output live, and keeps humans at the sign-off gate.
    link: /architecture
    linkText: How the system is built
  - title: Local-first, zero lock-in
    details: Runs on your machine, MIT-licensed, zero runtime dependencies. Easy to adopt, easy to leave.
    link: /vision
    linkText: The principles
---