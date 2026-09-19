# repoos.toml reference

This page is the definitive reference for the repo-scoped configuration files
that control RepoOS. Every field is optional; a repo with no `repoos.toml` still
runs on defaults.

RepoOS separates committed project configuration from secrets:

- `repoos.toml` is for project behavior, board settings, preview checks, auth
  UX, releases, and deployments.
- The repo-root `.env` is for repo-specific secrets and local overrides.
- The machine or service environment is for shared credentials such as a host-wide
  provider or tunnel token.

No secret belongs in `repoos.toml`.

The Settings UI exposes the most common fields directly, and its raw `repoos.toml`
editor can edit the full file — including `[preview]`, `[check]`, `[release]`,
`[[deployments]]`, `[[distribution]]`, `[worktrees]`, and anything else the tabs
might not surface.

Values stay on one line in TOML. RepoOS intentionally does not accept multi-line
arrays, multi-line strings, or inline tables.

## Starter `repoos.toml`

```toml
# repoos.toml
workDir = "work"
docsDir = "docs"
skillsDir = "skills"
inputsDir = "inputs"
cacheDir = ".repoos"

# Board defaults
defaultStatus = "inbox"
defaultAssignee = "unassigned"
defaultTaskMode = "freeform"
maxActiveTasks = 3
autoEngineeringMode = false
skillSuggestions = false
worktreeWarnThreshold = 20

# Server / UI
servePort = 7171
theme = "system"
uiTheme = "classic"
ntfyEnabled = false
ntfyTopic = ""
ntfyBaseUrl = "https://ntfy.sh"

# Task previews
[preview]
command = "bun run dev --port {port}"
readyPath = "/"

# Worktrees
[worktrees]
inheritEnv = false

# Checks
[check]
uiSmoke = "bun run smoke"
uiStylesheet = "src/styles.css"

# Auth
[auth]
enabled = true
sessionMaxAge = 2592000
bootstrapAdmin = "you@example.com"

[auth.emailProvider]
type = "resend"
fromAddress = "otp@send.example.com"

[auth.google]
clientId = "your-client-id.apps.googleusercontent.com"

# Releases / distribution
[release]
enabled = true
provider = "git-tag"
branch = "main"
versionFile = "package.json"
tagPrefix = "v"

[[distribution]]
name = "npm"
kind = "npm"
package = "@scope/package"
url = "https://www.npmjs.com/package/@scope/package"
install = ["npm install -g @scope/package"]

[[deployments]]
name = "Dashboard (prod)"
branch = "prod"
provider = "cloudflare-workers"
url = "https://app.example.com"

[board.columns]
draft = "Ideas"
inbox = "Backlog"
ready = "Selected for development"
active = "In progress"
review = "Code review"
done = "Shipped"

[remoteValidation]
enabled = false
fallbackToLocal = false
```

This is a starter, not a requirement. Omit any field and RepoOS uses its default.

## Layout and repository paths

```toml
workDir = "work"
docsDir = "docs"
skillsDir = "skills"
inputsDir = "inputs"
cacheDir = ".repoos"
```

- `workDir`: directory containing task markdown files. Default: `work`.
- `docsDir`: directory containing project context docs an agent reads before working. Default: `docs`.
- `skillsDir`: directory holding reusable skills. Default: `skills`.
- `inputsDir`: directory holding user-submitted inputs and attachments. Default: `inputs`.
- `cacheDir`: disposable derived state such as logs, indexes, and cached DBs. Default: `.repoos`.
- `taskExtensions`: optional file extensions treated as tasks. Default: `[".md"]`.

`cacheDir` holds only derived state. Delete it and RepoOS rebuilds it from the repo's task files; nothing of record is lost.

## Board behavior

```toml
defaultStatus = "inbox"
defaultAssignee = "unassigned"
defaultTaskMode = "freeform"
maxActiveTasks = 3
autoEngineeringMode = false
skillSuggestions = false
worktreeWarnThreshold = 20
```

- `defaultStatus`: status new tasks start in. Default: `inbox`.
- `defaultAssignee`: default assignee for new tasks. Default: `unassigned`.
- `defaultTaskMode`: new-task flow mode. Supported values: `freeform` and `manual`. Default: `freeform`.
- `maxActiveTasks`: number of tasks allowed active at once when auto-engineering is enabled. Default: `3`.
- `autoEngineeringMode`: when true, RepoOS can auto-start ready tasks up to the limit. Default: `false`.
- `skillSuggestions`: when true, finished tasks may generate a high-bar skill suggestion task. Default: `false`.
- `worktreeWarnThreshold`: amber warning threshold for registered worktrees. Default: `20`; set `0` to disable the warning.

### Board column labels

```toml
[board.columns]
draft = "Ideas"
inbox = "Backlog"
ready = "Selected for development"
active = "In progress"
review = "Code review"
done = "Shipped"
```

These are display labels only. The canonical status IDs remain `draft`, `inbox`, `ready`, `active`, `review`, and `done`. The values in the UI and CLI can be renamed without changing the underlying task status model.

Any label you do not override keeps its default. Empty, duplicate, or invalid strings fall back to the default for that status.

## Server and UI

```toml
servePort = 7171
theme = "system"
uiTheme = "classic"
ntfyEnabled = false
ntfyTopic = ""
ntfyBaseUrl = "https://ntfy.sh"
```

- `servePort`: default port used by `repoos serve`. If omitted, RepoOS derives a stable per-repo port so different checkouts on the same machine do not fight over `7171`.
- `theme`: UI theme preference. Supported values: `dark`, `light`, `system`. Default: `system`.
- `uiTheme`: design language. Supported values: `classic`, `clear`, `gen z`, `jelly`. Default: `classic`.
- `ntfyEnabled`: whether RepoOS publishes task lifecycle events to ntfy. Default: `false`.
- `ntfyTopic`: ntfy topic name. Empty means no publish.
- `ntfyBaseUrl`: self-hosted ntfy base URL. Default: `https://ntfy.sh`.

## Worktrees

```toml
[worktrees]
inheritEnv = false
```

`inheritEnv` is off by default and must be opted into deliberately. When enabled, RepoOS links the repo-root `.env` into task worktrees so preview or build commands can access project-specific secrets in a worktree. This is a deliberate security tradeoff: worktrees are not the repo, and secrets should not be copied there unless the user explicitly wants them.

If the main checkout does not ignore `.env`, RepoOS does not create the link.

## Task previews

```toml
[preview]
command = "bun run dev --port {port}"
readyPath = "/"
readyTimeoutMs = 30000

[[preview.targets]]
name = "Landing page"
areas = ["landing", "web"]
command = "bun run dev --port {port}"
cwd = "landing"
```

`[preview]` configures the read-only preview RepoOS starts from a task worktree when a task is in `active` or `review`.

- `command`: default preview command for tasks with no matching target.
- `readyPath`: route RepoOS polls until the app is ready. Default: `/`.
- `readyTimeoutMs`: maximum wait time before the preview is marked not ready.
- `targets`: named preview targets selected by a task's `area:` value.

`{port}` and `{host}` are replaced at runtime; the command's environment receives `PORT` and `HOST`. RepoOS owns the port and lifecycle; do not hardcode a port in a preview command.

A task with no usable preview configuration gets an actionable message instead of booting a random app. Previews are one-at-a-time and the newest request evicts the previous preview.

## Agents and runtime

```toml
maxConcurrentAgents = 5

[watchdog]
enabled = true
stalenessMs = 300000
autoTransition = true

[supervisor]
enabled = false
interval = 300
mode = "observe"
```

- `maxConcurrentAgents`: maximum number of agent processes to run at once. Default is computed from the machine's CPU count and capped sensibly.
- `watchdog.enabled`: whether active-task staleness monitoring runs. Default: `true`.
- `watchdog.stalenessMs`: inactivity threshold before a task is considered stuck. Default: `300000` ms.
- `watchdog.autoTransition`: whether a stale task should be auto-transitioned. Default: `true`.
- `supervisor`: built-in supervision configuration. Off by default.

### Runtime overrides

RepoOS runtime selection is controlled by environment variables, not `repoos.toml`.

| Variable | Effect |
| --- | --- |
| `REPOOS_RUNTIME=auto` or unset | Use Bun when available, otherwise Node |
| `REPOOS_RUNTIME=bun` | Prefer Bun |
| `REPOOS_RUNTIME=node` | Force Node |
| `REPOOS_BUN_PATH=/path/to/bun` | Use a specific Bun binary |

These are supportable user-facing overrides. Internal process and reload variables such as `REPOOS_AGENT`, `REPOOS_RELOAD`, `REPOOS_CHECK_CHANGED`, `REPOOS_TEST_WORKERS`, `REPOOS_SKIP_TESTS`, and `REPOOS_FORCE_BUILD` are runtime details, not normal configuration. See [Environment and secrets](/environment-and-secrets).

## Authentication

```toml
[auth]
enabled = true
sessionMaxAge = 2592000
bootstrapAdmin = "you@example.com"

[auth.emailProvider]
type = "resend"
fromAddress = "otp@send.example.com"

[auth.google]
clientId = "your-client-id.apps.googleusercontent.com"
```

- `auth.enabled`: whether authentication is on. Default: `false`.
- `auth.sessionMaxAge`: session lifetime in seconds. Values under 300 are treated as days; larger values are read as seconds. Default: `2592000` (30 days).
- `auth.bootstrapAdmin`: admin email used to claim the first account on a fresh install.
- `auth.emailProvider.type`: supported provider type. Today: `resend`.
- `auth.emailProvider.fromAddress`: sender address for email OTPs.
- `auth.google.clientId`: optional Google OAuth client ID.

Secrets such as `REPOOS_RESEND_API_KEY`, `REPOOS_GOOGLE_CLIENT_SECRET`, and `REPOOS_AUTH_SESSION_SECRET` belong in `.env`, not in `repoos.toml`. See [Authentication](/authentication) and [Environment and secrets](/environment-and-secrets).

## Releases, deployments, and distribution

### Release configuration

```toml
[release]
enabled = true
provider = "git-tag"
branch = "main"
versionFile = "package.json"
tagPrefix = "v"
remote = "origin"
repository = "owner/repo"
workflow = ".github/workflows/release.yml"
```

- `enabled`: turns the Releases UI on. Default: `false`.
- `provider`: release provider. Default: unset; today supported value: `git-tag`.
- `branch`: branch a release is cut from. Default: `main`.
- `versionFile`: file storing the semantic version.
- `tagPrefix`: tag prefix. Default: `v`.
- `remote`: git remote to receive the tag.
- `repository`: optional GitHub repo for display links.
- `workflow`: optional workflow path shown in the UI.

### Deployment rows

```toml
[[deployments]]
name = "Dashboard (prod)"
branch = "prod"
provider = "cloudflare-workers"
url = "https://app.example.com"
subdir = "app"
```

Each row models one service-and-branch pair. `name` and `branch` are required; `provider` is informational; `url` is the live target; `subdir` scopes the freshness lookup to a subdirectory of the repo.

### Distribution destinations

```toml
[[distribution]]
name = "npm"
kind = "npm"
package = "@scope/package"
url = "https://www.npmjs.com/package/@scope/package"
install = ["npm install -g @scope/package"]
```

A release can list one or more install destinations in the `Published to` section. `name` is required. `kind` chooses the public lookup strategy (`npm`, `homebrew`, `github-release`, or `custom`). See [Deployments and releases](/deployments-and-releases).

## Checks

```toml
[check]
uiSmoke = "bun run smoke"
uiStylesheet = "src/styles.css"
```

These are optional repo-specific guardrails for `repoos check`. When omitted, the corresponding step simply skips. This keeps the gate generic while letting a repo customize the UI smoke check or CSS coverage rules. See [Checks before merge](/check).

## Notifications and tunnels

```toml
tunnelEnabled = true
ntfyEnabled = true
ntfyTopic = "repoos_myproject"
ntfyBaseUrl = "https://ntfy.sh"
```

- `tunnelEnabled`: exposes Cloudflare Tunnel controls in the web UI. Default: `false`.
- `ntfyEnabled`: publishes task lifecycle events to an ntfy topic. Default: `false`.
- `ntfyTopic`: topic name used for notifications.
- `ntfyBaseUrl`: base URL for a self-hosted ntfy server.

The tunnel and infrastructure pieces are machine-level concerns. Credentials such as `CLOUDFLARE_API_TOKEN` and `HETZNER_API_TOKEN` belong in the environment, not `repoos.toml`.

## Remote validation

```toml
[remoteValidation]
enabled = false
provider = "hetzner"
serverType = "cax31"
location = "hil"
idleShutdownMinutes = 8
maxServerLifetimeMinutes = 120
fallbackToLocal = false
```

Remote validation is opt-in and off by default. It runs expensive validation work on a disposable cloud VM rather than on the user's laptop. It needs environment credentials such as `HETZNER_API_TOKEN` and `REPOOS_REMOTE_SSH_KEY`; these are not committed config values.

## Summary

The short rule is simple: commit project behavior in `repoos.toml`, keep secrets in a gitignored `.env` or machine environment, and treat anything with a `REPOOS_` prefix as an environment override only when it is documented as a public supported override. For the full secret contract, read [Environment and secrets](/environment-and-secrets).
