# CLI reference

Run `repoos` with no arguments to see this list in your terminal.

## Setup

### `repoos init [name]`

Scaffolds `work/`, `docs/`, `AGENTS.md`, `repoos.toml` and a `.gitignore` entry
in the current repo, plus a `ready` starter task so the board isn't empty. Run
outside a git repo, it starts a guided new-project flow instead, which can
launch the web console for you.

### `repoos upgrade [--channel beta|canary|rc]`

Self-updates a standalone (curl-installed) RepoOS to the latest release.
Tracks stable by default; `--channel` follows a prerelease line. No-ops with a
message if you installed via a package manager (use `bun update` / `npm update`)
or are running from a source checkout (`git pull && bun run build`).

## The board

### `repoos new "<title>"`

Creates a task.

```bash
repoos new "Fix the login redirect loop" --type bug --area web --priority p1
```

| Flag | Values |
| --- | --- |
| `--type` | `feature`, `bug`, `chore`, `spec`, `refactor` |
| `--priority` | `p0`, `p1`, `p2`, `p3` |
| `--area` | Free text — your own grouping (`web`, `server`, `core`…) |
| `--ai` | Assign to an AI agent |
| `--body` | Task body; pass `-` to read from stdin |

### `repoos list [status]`

Shows the board, or one column: `inbox`, `ready`, `active`, `review`, `done`.

### `repoos show <id>`

Prints a task's full spec — metadata, body, and activity log.

### `repoos mv <id> <status>`

Moves a task to a new status. Takes `--note "..."` to record why.

```bash
repoos mv 0001 ready --note "spec is settled, ready to hand over"
```

### `repoos update <id>`

Edits a task's metadata or body: `--title`, `--area`, `--priority`, `--type`,
`--body`, `--branch`, `--assigned-to`.

### `repoos note <id> "<text>"`

Appends a free-form note to the task's activity log. Useful for leaving context
an agent should read before picking the task up.

### `repoos new-doc "<description>"`

Creates a document from a description, via the Product Manager agent.

## Running it

### `repoos serve [--port N]`

Starts the local server — web UI, API, and live event stream. Without `--port`
it uses `servePort` from `repoos.toml`, or a stable port derived from the repo's
path so separate repos never collide.

### `repoos stop [--port N]`

Stops this repo's server, identified by its own lockfile. It will not touch a
server belonging to a different repo.

### `repoos status [--json]`

One-screen health snapshot: server, build freshness, board counts, worktrees,
tunnel, and git state.

## Quality and maintenance

### `repoos check`

The definition-of-done gate: build staleness, full build, and tests always
run; formatting/lint and a UI smoke test run once your repo declares them
(see [The check gate](/check)). Exits non-zero on any failure, so it works as
a CI gate as well as a local one.

### `repoos index [--json]`

Rebuilds the derived index cache. The cache is disposable — the markdown files
are the source of truth — so this is safe to run any time.

### `repoos gc [--yes|--dry-run]`

Reclaims leaked task worktrees and branches. Conservative by default: it only
removes worktrees that are merged and clean, and reports anything holding real
uncommitted or unmerged work rather than deleting it.

### `repoos tunnel <subcommand>`

Publishes local apps through Cloudflare Tunnel + Zero Trust:
`setup`, `create`, `allow`, `deny`, `start`, `install`, `stop`, `list`, `status`.
