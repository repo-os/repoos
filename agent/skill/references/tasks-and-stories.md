# Tasks and stories

## Discover the current commands

Never guess a flag. The installed CLI is the source of truth:

```bash
repoos --help                 # every command, grouped, with its flags
repoos new --help             # full usage for one command
repoos story --help
```

The browsable equivalent is the [CLI reference](https://docs.repoos.org/cli).
If a command or flag is missing from both, say so instead of inventing it.

## Create a task

```bash
repoos new "Fix the login redirect loop" --type bug --area web --priority p1
repoos new "Build the settings screen" --depends-on 0542,0538
repoos new "Wire up the export endpoint" --paths src/server/export.ts --hold true
```

Common flags: `--type feature|bug|chore|spec|refactor`, `--priority p0|p1|p2|p3`,
`--area web,core`, `--story "name"`, `--depends-on <ids>`, `--assigned-to ai|human`
(or `--ai` / `--human`), `--body "<text>"|-`, and `--paths a,b`.

`repoos new` writes the task file under the configured `workDir`. Do not create
or edit that file by hand — RepoOS owns its frontmatter and activity log.

## Work the board

```bash
repoos list                   # the board, or one status column
repoos list ready
repoos show 0012              # one task's full spec
repoos mv 0012 ready          # move a task through its statuses
repoos note 0012 "..."        # append an activity note
repoos update 0012 --priority p1
```

Statuses are `inbox`, `ready`, `active`, `review`, and `done`. Moving a task to
`review` requests the handoff/review path; moving it to `done` is the close-out
path, not a plain metadata edit. Leave those transitions to the RepoOS server or
the human unless they asked you to drive the board.

## Stories

A story is an optional grouping over tasks — a delivery slice with its own
definition file. Write one verbatim without the PM agent:

```bash
repoos story new "Project updates email" --body "Why this slice exists, scope, non-goals."
repoos story new "Checkout rework" --body -            # body from stdin
repoos story list                                     # numbers + paths
repoos story show 0007                                # definition + member tasks
repoos story update 0007 --body "Rewritten scope."    # keeps the stable number
```

`repoos story list --json` and `repoos story show 0007 --json` are available for
scripts. Tag a task as part of a story with `repoos new ... --story "name"`.

Read more: [Concepts](https://docs.repoos.org/concepts) and
[Configuration → Stories](https://docs.repoos.org/configuration#stories).
