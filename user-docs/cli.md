# CLI reference

Run `repoos` with no arguments to see this list in your terminal.

## Setup

### `repoos init [name]`

Scaffolds RepoOS files in the current repo, plus a `ready` starter task so the
board isn't empty. By default files go under a `repoos/` subdirectory;
interactive prompts let you choose a different location or `/` for the repo
root. `repoos.toml` and `AGENTS.md` always stay at the root. Run outside a git
repo, it starts a guided new-project flow instead, which can launch the web
console for you.

### `repoos upgrade [--channel beta|canary|rc]`

Self-updates a standalone (curl-installed) RepoOS to the latest release.
Tracks stable by default; `--channel` follows a prerelease line. Package-manager
installs are not modified: RepoOS detects the usual npm, Bun, pnpm, mise, and
Homebrew paths and prints the matching update command instead. `--channel`
applies only to the standalone curl install.

See [Updating RepoOS](/getting-started#updating-repoos) for every install method.

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

### `repoos doctor [--json]`

A read-only readiness preflight for a real project. It checks the repository
identity (root, git, linked worktree), parses and validates `repoos.toml`,
verifies the configured layout and existing task frontmatter, detects the
required runtimes and enabled agent CLIs, explains whether a meaningful
`repoos check` plan is configured, and reports server, auth and credential
readiness — each with a stable finding id, a severity (`pass` / `warn` / `fail`)
and a concrete next step.

```bash
repoos doctor            # compact pass/warn/fail report with remediation
repoos doctor --json     # the same findings, machine-readable
```

It never initializes, rewrites config, installs, logs in, contacts a model
provider, kills a process or mutates git, and it works offline. It exits
non-zero when any finding is a failure, so it is usable in a script. Paste
`repoos doctor` output into an issue to report a setup problem.

### `repoos support bundle` / `repoos support inspect`

Creates a small, inspectable, **redacted** diagnostic archive to attach to an
issue when RepoOS fails on a real-world project. It is built locally and never
uploaded; opening a browser, copying to the clipboard or filing an issue are all
separate, explicit actions you take yourself.

```bash
repoos support bundle                   # write .repoos/support/repoos-support-<ts>.tar.gz
repoos support bundle --dry-run         # show exactly what would be included; write nothing
repoos support bundle --out /tmp/x.tar.gz
repoos support inspect <bundle.tar.gz>  # list every file inside an existing bundle
```

The bundle contains a versioned structured report: RepoOS version/build metadata,
platform/runtime versions, the effective configuration *shape* (flags, counts,
schema versions — never secret values or free-form fields), agent/tool detection
and versions, the resolved check plan, the sanitized `repoos doctor` findings,
the classified result of the latest doctor run, server/health/lifecycle
diagnostics, bounded recent error messages, and a machine-readable
`manifest.json` listing every file, its size and hash, the collection time and
the redaction rules/version.

It never includes `.env`, environment values, API tokens, passwords, cookies,
SSH keys, session material, prompts, transcripts, task bodies, source code,
diffs, attachments or raw logs. Home directories and the repo root are minimized
to `~` and `<repo>`. A final scan verifies no known secret shape or private path
survived; a miss **aborts** the write rather than packaging it. A down server, a
missing agent CLI or an unparseable `repoos.toml` degrade that one section into
an explicit omission with the reason, and the rest of the bundle is still
written. The default output lands under the cache directory (gitignored in most
repos); if that path is inside the repo and not gitignored, both the CLI and the
UI warn that the archive could be committed and suggest `--out` or a
`.gitignore` entry. In the web UI it is on **Settings → Support**, and a
**Create a redacted support bundle** action also sits on the failed
Move-to-done / check panel — the moment you're most likely to need it.

## Quality and maintenance

### `repoos check`

The definition-of-done gate. It runs the check plan your repo declares in
`repoos.toml` — for any stack (see [Checks before merge](/check)). Exits
non-zero on any failure, so it works in CI as well as locally.

```bash
repoos check --profile full      # every declared step, including slow ones
repoos check --changed main      # fast pre-review pass over changed paths
repoos check --print-plan        # print the resolved plan as [[check.steps]]
```

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
