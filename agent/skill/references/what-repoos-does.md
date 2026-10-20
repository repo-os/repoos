# What RepoOS does

RepoOS is a repo-native task board for work done by coding agents.

- **The repository is the source of truth.** A task is a Markdown file with
  YAML frontmatter in the configured task directory — `repoos/work/` on a fresh
  install. There is no board database; the web UI is a view over the files.
- **Status lives in frontmatter.** Tasks move through
  `inbox → ready → active → review → done` by changing that one field. Files
  never move between directories.
- **Agents work in isolated Git worktrees.** An active task gets its own branch
  and worktree, so agent work never lands in the primary checkout.
- **A person approves every merge.** Checks run before handoff, a review gate
  looks at the diff, and only then does the branch merge into `main`. Agents do
  not merge their own work.

What each status means:

| Status | Meaning |
| --- | --- |
| `inbox` | Captured, not specified well enough to act on. |
| `ready` | Specified; an agent or person can pick it up as-is. |
| `active` | Being worked in its own worktree. |
| `review` | Implementation finished and checks pass; waiting on a person. |
| `done` | Approved and merged. |

The project's own context — architecture notes, decisions, history — lives in
the configured docs directory (`repoos/docs/` by default). `AGENTS.md` at the
repository root tells every agent how to operate there. Both are versioned
alongside the code.

RepoOS runs locally on the user's machine. It has zero runtime dependencies and
runs on Bun, with Node 20 or newer as a fallback. It does not host source code.

Read more: [Concepts](https://docs.repoos.org/concepts) and
[Why RepoOS](https://repoos.org).
