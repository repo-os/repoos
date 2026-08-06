# RepoOS

The repo is the operating system. Tasks live as markdown files under `work/`
with status in the frontmatter — no database, no lock-in, fully diffable and
reviewable like the code they drive.

```sh
bunx repoos init      # scaffold AGENTS.md + work/ into this repo
repoos list           # see the board on the command line
repoos serve          # open the web UI
repoos check          # the definition-of-done gate
```

## Why files?

Because a task is just a reviewable diff. Status changes are commits, not
rows. AI agents and humans read the same markdown, and the whole roadmap ships
with the code.
