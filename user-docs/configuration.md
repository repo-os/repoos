# Configuration

RepoOS is configured by `repoos.toml` at the repo root, with secrets kept in a
gitignored `.env`. Every field is optional — a repo with no `repoos.toml` at all
still works on defaults.

The **Settings** page edits the common fields directly, and includes a **Raw
repoos.toml** editor at the bottom for everything else — `[preview]`, `[check]`,
`[release]`, `[[deployments]]`, and any section the fields above don't cover.
The raw editor validates TOML before saving and refuses a save if the file
changed underneath it (another tab, or a field auto-save), so neither editor
silently overwrites the other. Secrets still belong in `.env`, not here.

## Layout

```toml
workDir  = "work"     # where task markdown files live
docsDir  = "docs"     # project context an agent reads before working
cacheDir = ".repoos"  # derived index, logs, database — disposable
```

`cacheDir` holds only derived state. Delete it and RepoOS rebuilds everything
from the markdown files; nothing of record is lost.

## Board behavior

```toml
defaultStatus   = "inbox"     # status new tasks start in
defaultAssignee = "ai"        # "ai" or "human"
defaultTaskMode = "freeform"
maxActiveTasks  = 3           # how many tasks may be active at once
autoEngineeringMode = false   # automatically dispatch ready tasks to agents
worktreeWarnThreshold = 20    # warn once this many task worktrees exist
```

## Server

```toml
servePort = 7171
```

Without `servePort`, `repoos serve` derives a **stable port from the repo's own
path**, so two repos running RepoOS at the same time never fight over one port.
Pin it only when something external depends on a fixed port (a tunnel, a
launchd/systemd unit, a bookmarked URL).

`repoos stop` finds the right process through a per-port lockfile, so stopping
one repo's server never kills another's.

## Task previews

A preview is a read-only server RepoOS starts from a task's worktree so you can
look at the change in a browser while the task is `active` or `review`. Declare
what to boot in `[preview]` so RepoOS can preview *your* project:

```toml
[preview]
command   = "bun run dev --port {port}"   # optional default for every area
readyPath = "/"                           # optional, default "/"

[[preview.targets]]
name    = "Landing page"
areas   = ["landing", "web"]              # matched against a task's `area:`
command = "bun run dev --port {port}"
cwd     = "landing"                       # relative to the task's worktree
```

- `{port}` and `{host}` are replaced with the values RepoOS chose; `PORT` and
  `HOST` are also set in the command's environment. RepoOS owns the port and
  the process lifecycle — never hardcode one.
- A task is matched to the target whose `areas` includes its `area:`. If none
  matches, the default `[preview] command` runs; if there is none, the preview
  request tells you how to configure one for that area (instead of failing).
- `readyPath` is the path RepoOS polls until the app is up; it defaults to `/`.
- There is no built-in default target. A repo (or a task's area) with no
  matching `[preview]` config gets an actionable "no preview configured" message
  naming the area and the snippet to add — not RepoOS's own board.

Previews are on demand and one runs at a time — starting another evicts the
previous one.

## Agents

```toml
maxConcurrentAgents  = 5        # agent CLI processes running at once; extras queue
ctoMonitorIntervalMs = 300000   # CTO agent poll interval
```

`maxConcurrentAgents` defaults to a value computed from your machine's core
count. Raise it if the machine still looks idle under load, lower it if it's
straining — agents are subprocess- and network-heavy, so the right number is
usually well below your core count.

## Runtime {#runtime}

RepoOS runs under Bun when available and Node otherwise. Control it with
environment variables, not `repoos.toml`:

| Variable | Effect |
| --- | --- |
| *(unset)* or `REPOOS_RUNTIME=auto` | Use Bun if it's on `PATH`, else Node. The default. |
| `REPOOS_RUNTIME=bun` | Require Bun; warn and stay on Node if it's missing. |
| `REPOOS_RUNTIME=node` | Always Node. The opt-out. |
| `REPOOS_BUN_PATH=/path/to/bun` | Use this binary explicitly, skipping the `PATH` lookup. |

This applies to every `repoos` command, not just `repoos serve`. The `repoos`
launcher the install script creates starts Bun directly when it's installed, so
there's no Node step at all.

`repoos serve` prints which runtime it picked at startup. Bun is substantially
faster for the subprocess-heavy work RepoOS does — on this project's own test
suite it's roughly a 5x difference — so the default is worth keeping unless you
have a reason to pin Node.

## Authentication

Auth is off by default. When enabled, the server refuses to start unless both a
login provider and a `bootstrapAdmin` are configured.

```toml
auth.enabled        = true
auth.sessionMaxAge  = "2592000"           # seconds
auth.bootstrapAdmin = "you@example.com"   # only this address can claim the founding admin account
auth.emailProvider.type        = "resend"
auth.emailProvider.fromAddress = "otp@send.example.com"
# auth.google.clientId = "..."            # optional "Sign in with Google" button
```

Secrets never go in `repoos.toml` — it's git-tracked. Put them in `.env`:

```bash
REPOOS_RESEND_API_KEY=...
REPOOS_GOOGLE_CLIENT_SECRET=...
```

Auth changes take effect on the next `repoos serve`, not live.

## Remote validation

Offloads the test suite to a disposable cloud VM, so a long check doesn't tie up
(or get starved by) your laptop.

```toml
remoteValidation.enabled         = false
remoteValidation.fallbackToLocal = false
```

Needs `HETZNER_API_TOKEN` and `REPOOS_REMOTE_SSH_KEY` in `.env`, plus a prebuilt
snapshot.

## Releases

Opt-in. When configured, RepoOS pushes an annotated version tag from a clean
trunk after `repoos check` passes; your CI does the actual build and publish.

```toml
[release]
enabled     = true
provider    = "git-tag"
branch      = "main"
versionFile = "package.json"
tagPrefix   = "v"
remote      = "origin"
```

The "Releases" page only appears in the UI when this block is present.

## Appearance and notifications

```toml
theme       = "dark"
uiTheme     = "classic"   # classic | clear | gen z | jelly
ntfyEnabled = true
ntfyTopic   = "your_topic"
```
