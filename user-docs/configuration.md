# repoos.toml reference

This page is the definitive reference for RepoOS project configuration. Every
field is optional; a repo with no `repoos.toml` still runs on defaults.

RepoOS separates project settings from secrets:

| Where | Good for | Committed? |
| --- | --- | --- |
| `repoos.toml` (repo root) | project behavior, board settings, previews, checks, auth UX, releases, deployments | Yes — git-tracked |
| `.env` (repo root, gitignored) | repo-specific secrets and local overrides | No |
| machine / service environment | machine-wide provider keys and infrastructure credentials | No |

**No secret belongs in `repoos.toml`.** Set provider and session secrets in
`.env` or the machine environment instead. The one secret field the Settings UI
will write to the file is `whisper.apiKey` — and you should still prefer
`REPOOS_WHISPER_KEY` in `.env`. The full secret contract — precedence, rotation,
and the safe `.env.example` — is in
[Environment and secrets](/environment-and-secrets).

## How values are resolved

1. The repo-root `.env` is loaded at startup, filling in values the real
   environment hasn't already set.
2. Real shell or service environment variables always win over `.env`.
3. `repoos.toml` is the committed source of non-secret config.
4. A supported environment variable overrides the corresponding `repoos.toml`
   field (for example `NTFY_BASE_URL` overrides `ntfyBaseUrl`, and
   `REPOOS_RESEND_API_KEY` fills `[auth.emailProvider]`).

`repoos.toml` is deliberately small and flat. Values stay on one line: RepoOS
does not accept multi-line arrays, multi-line strings, or inline tables. Nested
sections use `[section]` headers and arrays of tables use `[[section]]` rows.
The only place the parser accepts both `[check]` and `[checks]` spellings is the
`[check]` section, kept for backwards compatibility.

The Settings UI edits the most common fields directly, and its raw
`repoos.toml` editor can edit the whole file — including `[preview]`, `[check]`,
`[release]`, `[stories]`, `[[deployments]]`, `[[distribution]]`, `[worktrees]`,
`[tunnel]`, and anything the tabs don't surface.

## Annotated starter `repoos.toml`

Copy this and delete anything you don't need. It shows the documented defaults
plus a realistic value for each optional section. **The example is
illustrative, not a recommended starting point:** it renames board columns and
includes sections most repos never use, so delete what doesn't apply to you
before committing.

The example keeps optional features off by default (`release.enabled = false`,
`autoEngineeringMode = false`, `worktrees.inheritEnv = false`, and so on) so
copying it wholesale is safe.

```toml
# repoos.toml — all fields optional; delete a line to take its default.
# This file is committed to git. Never put a secret here; the one secret field
# the Settings UI will write is whisper.apiKey, which belongs in .env as
# REPOOS_WHISPER_KEY instead.
#
# Top-level keys must come before the first [table] header — in TOML a bare
# key after a header belongs to that table.

# ── Layout and repository paths ──────────────────────────────────────────
workDir = "work"          # task markdown files
docsDir = "docs"          # context docs an agent reads first
skillsDir = "skills"      # reusable skills
inputsDir = "inputs"      # user-submitted inputs and attachments
cacheDir = ".repoos"      # derived state; safe to delete
taskExtensions = [".md"]  # file extensions treated as tasks

# ── Board behavior ───────────────────────────────────────────────────────
defaultStatus = "inbox"        # draft | inbox | ready | active | review | done
defaultAssignee = "unassigned" # unassigned | ai | human
defaultTaskMode = "freeform"   # freeform | manual
maxActiveTasks = 3             # 1-20; used when auto-engineering is on
autoEngineeringMode = false
skillSuggestions = false
worktreeWarnThreshold = 20     # 0 disables the warning

# ── Server and UI ────────────────────────────────────────────────────────
servePort = 7171   # omit to derive a stable per-repo port (7200-7999)
strictBuild = false

# ── Agents ───────────────────────────────────────────────────────────────
maxConcurrentAgents = 5  # omit to size from this machine's CPU count

# ── Notifications ────────────────────────────────────────────────────────
ntfyEnabled = false
ntfyTopic = ""
ntfyBaseUrl = "https://ntfy.sh"

# ── Board column labels (display only; status IDs never change) ──────────
[board.columns]
draft = "Ideas"
inbox = "Backlog"
ready = "Selected for development"
active = "In progress"
review = "Code review"
done = "Shipped"

# ── Worktrees and runtime ────────────────────────────────────────────────
[worktrees]
inheritEnv = false  # off by default; opt in to link .env into worktrees

[watchdog]
enabled = true
stalenessMs = 300000
autoTransition = true

[whisper]
provider = "none"  # none | groq | openai
# apiKey = "..."   # a secret — prefer REPOOS_WHISPER_KEY in .env

# ── Task previews ────────────────────────────────────────────────────────
[preview]
command = "bun run dev --port {port}"
readyPath = "/"
readyTimeoutMs = 10000

[[preview.targets]]
name = "Landing page"
areas = ["landing", "web"]
command = "bun run dev --port {port}"
cwd = "landing"

# ── Checks ───────────────────────────────────────────────────────────────
[check]
version = 1
uiSmoke = "bun run smoke"
uiStylesheet = "src/styles.css"
backdropToken = "--bg"
gradientTokens = ["--btn-primary-bg"]

[[check.steps]]                   # the gate's plan; omit to infer from the repo
name = "build"
command = "bun run build"

[[check.themeScopes]]
selector = ":root"
name = "dark"
inherits = ["dark"]

[[check.contrastPairs]]
fg = "--txt"
bg = "--bg"

# ── Authentication ───────────────────────────────────────────────────────
[auth]
enabled = false
sessionMaxAge = 2592000       # seconds; values under 300 are read as days
bootstrapAdmin = "you@example.com"

[auth.emailProvider]
type = "resend"
fromAddress = "otp@send.example.com"

[auth.google]
clientId = "your-client-id.apps.googleusercontent.com"

# ── Releases, deployments, distribution ──────────────────────────────────
[release]
enabled = false           # true shows the Releases UI and API
provider = "git-tag"
branch = "main"
versionFile = "package.json"
tagPrefix = "v"
remote = "origin"
repository = "owner/repo"
workflow = ".github/workflows/release.yml"

[[deployments]]
name = "Dashboard (prod)"
service = "Dashboard"
branch = "prod"
provider = "cloudflare-workers"
url = "https://app.example.com"
dashboard_url = "https://dash.cloudflare.com/…"
subdir = "app"

[[distribution]]
name = "npm"
kind = "npm"
package = "@scope/package"
url = "https://www.npmjs.com/package/@scope/package"
install = ["npm install -g @scope/package"]

# ── Stories (opt-in cross-area delivery tracking) ────────────────────────
[stories]
enabled = false           # true shows the Stories page and task Story field

# ── Tunnels (managed by `repoos tunnel`) ─────────────────────────────────
[tunnel]
enabled = false
provider = "cloudflare"
name = "repoos-local"
domain = ""
tunnel_id = ""

# ── Remote validation ────────────────────────────────────────────────────
[remoteValidation]
enabled = false
serverType = "cax31"
location = "hil"
snapshotId = ""
sshKeyName = ""
idleShutdownMinutes = 8
maxServerLifetimeMinutes = 120
fallbackToLocal = false
useForReleases = false
```

The sections below document each field: its type, default, whether it is
committed (everything in this file is, with the noted `whisper.apiKey`
exception), and its effect and constraints.

## Layout and repository paths

```toml
workDir = "work"
docsDir = "docs"
skillsDir = "skills"
inputsDir = "inputs"
cacheDir = ".repoos"
taskExtensions = [".md"]
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `workDir` | string | `work` | yes | Directory holding task markdown files, relative to the repo root. This is the board. |
| `docsDir` | string | `docs` | yes | Directory holding context docs an agent reads before working. |
| `skillsDir` | string | `skills` | yes | Directory holding reusable skills (`skills/<name>/SKILL.md`). |
| `inputsDir` | string | `inputs` | yes | Directory holding user-submitted inputs and their attachments. |
| `cacheDir` | string | `.repoos` | yes | Derived state only — logs, indexes, cached databases. Delete it and RepoOS rebuilds from the task files; nothing of record is lost. |
| `taskExtensions` | array of strings | `[".md"]` | yes | File extensions treated as tasks. |

All paths are relative to the repo root. `repoos.toml` and `AGENTS.md` always
stay at the root regardless of how these are set. Changing `workDir`,
`cacheDir`, or `taskExtensions` triggers an index refresh.

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

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `defaultStatus` | select | `inbox` | yes | Status new tasks start in. One of `draft`, `inbox`, `ready`, `active`, `review`, `done`. |
| `defaultAssignee` | select | `unassigned` | yes | Default assignee for new tasks: `unassigned`, `ai`, or `human`. |
| `defaultTaskMode` | select | `freeform` | yes | New-task flow: `freeform` (the AI writes the task) or `manual` (a form). Any other value falls back to `freeform`. |
| `maxActiveTasks` | number | `3` | yes | Cap on simultaneously active tasks when `autoEngineeringMode` is on. Must be 1–20. |
| `autoEngineeringMode` | boolean | `false` | yes | When true, RepoOS selects and starts ready tasks automatically, up to `maxActiveTasks`. |
| `skillSuggestions` | boolean | `false` | yes | When true, a finished task may generate a high-bar, evidence-gated skill suggestion task. Off by default; a single session never creates one. |
| `worktreeWarnThreshold` | number | `20` | yes | Advisory ceiling on registered git worktrees. Above it the Control page's Codebase card turns amber and the server logs a `repoos gc` reminder. Never blocks a task. Set `0` to disable. |

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

`board.columns.draft`, `board.columns.inbox`, `board.columns.ready`,
`board.columns.active`, `board.columns.review`, and `board.columns.done` rename
the six column labels shown in the UI and CLI. These are display labels only:
the canonical status IDs never change, and transitions, frontmatter, and
API/CLI status inputs are unaffected.

Constraints: a label is a string of at most 40 characters; blank labels,
duplicates of another column's label, or over-length values fall back to that
column's default. Any column you don't override keeps its default. The default
labels are `Proposed / Drafts`, `Inbox`, `Ready`, `Active`, `Review`, `Done`.

## Server and UI

```toml
servePort = 7171
strictBuild = false
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `servePort` | number | derived per repo | yes | Port `repoos serve` binds by default. If omitted, RepoOS derives a stable port from the repo's path in the 7200–7999 range, so two checkouts never collide. Must be 1–65535. `--port` on the command line overrides it. |
| `strictBuild` | boolean | `false` | yes | When true, a stale build makes `repoos` exit with an error instead of printing a warning. `REPOOS_STRICT_BUILD=1` (environment) and the `--strict-build` flag do the same without changing the file. |

Appearance is **not** a `repoos.toml` setting. The dark/light/system theme and
the UI design language are per-browser preferences stored in the browser, so
they never travel with the repo.

## Worktrees and runtime

```toml
[worktrees]
inheritEnv = false
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `worktrees.inheritEnv` | boolean | `false` | yes | When true, RepoOS symlinks the main checkout's `.env` into each task worktree so worktree-local build or preview commands can read project secrets. |

**`inheritEnv` is off by default and must be opted into deliberately.** Every
worktree is another place secrets live on disk. When enabled, RepoOS creates a
symlink (not a copy) at `<worktree>/.env` pointing to the main checkout's
`.env`. The link is created only when all of these hold:

- The main checkout has a `.env` file.
- The worktree does not already have its own real `.env`.
- The worktree's own `.gitignore` (or any active ignore rule) covers `.env` — RepoOS checks this with `git check-ignore` inside the worktree, not in main. If the path is not ignored, no link is made to prevent an accidental secret commit.

Runtime selection is controlled by environment variables, not `repoos.toml`:
`REPOOS_RUNTIME` (`auto`, `bun`, or `node`) and `REPOOS_BUN_PATH` (an explicit
Bun binary). These are the supported public runtime overrides — see
[Environment and secrets](/environment-and-secrets) for the full list.

## Agents

```toml
maxConcurrentAgents = 5

[watchdog]
enabled = true
stalenessMs = 300000
autoTransition = true

[whisper]
provider = "none"
# apiKey = "..."
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `maxConcurrentAgents` | number | derived from CPU count | yes | How many agent CLI processes (start/send/chat) may run at once; extras queue. Must be 1–16. The default is computed from this machine's CPU count and capped sensibly. |
| `watchdog.enabled` | boolean | `true` | yes | Whether active-task staleness monitoring runs. |
| `watchdog.stalenessMs` | number | `300000` (5 min) | yes | Milliseconds of silence before an `active` task is a candidate-stuck. Minimum `60000`; smaller values are ignored. |
| `watchdog.autoTransition` | boolean | `true` | yes | Whether a stuck task auto-transitions out of `active` — to `review` when its worktree holds work, else back to `ready`. When false, it is only flagged `needsInput`. |
| `whisper.provider` | select | `none` | yes | Voice-to-text provider for text areas: `none`, `groq`, or `openai`. |
| `whisper.apiKey` | string | `""` | **exception** | API key for the selected whisper provider. Accepted here, but a secret — prefer `REPOOS_WHISPER_KEY` in `.env`. |

The lifecycle roles and custom agents are stored as `[[agents]]` rows
(`name`, `cli`, `model`, `enabled`, `instructions`, `skills`) and are managed
from the **Agents** page. Prefer the UI over hand-editing them. See
[Agents](/agents) for the supported CLIs and roles.

The built-in supervisor is not exposed as a `repoos.toml` key.

## Previews and checks

```toml
[preview]
command = "bun run dev --port {port}"
readyPath = "/"
readyTimeoutMs = 10000

[[preview.targets]]
name = "Landing page"
areas = ["landing", "web"]
command = "bun run dev --port {port}"
cwd = "landing"
```

`[preview]` configures the read-only preview RepoOS starts from a task worktree
when a task is in `active` or `review`.

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `preview.command` | string | unset | yes | Default preview command, used when no target matches the task's `area`. |
| `preview.cwd` | string | worktree root | yes | Subdirectory of the worktree to run the default command in. |
| `preview.readyPath` | string | `/` | yes | Path polled for readiness, relative to the preview URL. A missing leading slash is added. |
| `preview.readyTimeoutMs` | number | `10000` | yes | How long to wait for the default command to answer before giving up. Raise it for a command that also builds first. |
| `preview.targets[].name` | string | derived from `areas` | yes | Human label for diagnostics and the preview picker. |
| `preview.targets[].areas` | array of strings | `[]` | yes | Task `area:` values this target serves, matched case-insensitively. |
| `preview.targets[].command` | string | required | yes | Command that boots the target. Rows without one are dropped. |
| `preview.targets[].cwd` | string | worktree root | yes | Subdirectory of the worktree to run the command in. |
| `preview.targets[].readyPath` | string | `/` | yes | Per-target readiness path (`ready_path` is also accepted). |
| `preview.targets[].readyTimeoutMs` | number | `10000` | yes | Per-target readiness timeout (`ready_timeout_ms` is also accepted). |

`{port}` and `{host}` are replaced at runtime, and the command's environment
also receives `PORT` and `HOST`. RepoOS owns the port and lifecycle; never
hardcode a port in a preview command. A task with no usable preview
configuration gets an actionable "no preview configured" message rather than
booting a random app. Previews are one-at-a-time and a new request evicts the
previous preview.

### Preview-only overrides

A `[preview.<base key>]` table deep-merges over the base configuration **only
when a preview starts**, so a local preview can run with deliberately different
settings without weakening normal startup:

```toml
[auth]
enabled = true          # normal `repoos serve` still requires login

[preview.auth]
enabled = false         # local previews skip the OTP/login step
```

The dotted key here is `preview.auth.enabled`. The effective configuration a
preview boots with is resolved in this order, later winning:

1. built-in defaults,
2. the base `repoos.toml`,
3. the `[preview.*]` overlay,
4. explicit command-line flags (`--port`, `--host`).

Because the overlay deep-merges, an override changes only the keys it names:
`[preview.auth] enabled = false` leaves `auth.sessionMaxAge`,
`auth.bootstrapAdmin`, and every other `[auth]` setting at their base values.
Only keys the parser supports can be overridden; an unknown override is ignored
with a warning rather than silently accepted as a typo.

Overrides apply **only** to the preview runtime — a managed preview child
(`REPOOS_PREVIEW_CHILD=1`, set by the preview manager) and the UI-test preview
harness. A normal `repoos serve`, `repoos check`, or any other command reads the
base configuration and ignores `[preview.*]` entirely, so this is a local
preview/UI-test convenience that never alters normal or production-like startup.

Supported commands and the escape hatch:

- `repoos serve` applies the overlay automatically when it is a preview child.
  Pass `--preview-overrides` to force it on for a manual UI-test preview, or
  **`--no-preview-overrides`** to run a preview against the base configuration.
- Managed task previews (the **Preview** button, and the
  `::repoos-preview-request::` agent signal) always apply the overlay.

Preview startup reports the effective override keys it applied — in the server
log, the preview status, and the task transcript. When an override disables
auth, the listener stays on `127.0.0.1` unless `--host` was passed explicitly,
so an auth-less local preview is never accidentally exposed beyond loopback.

> `[preview.auth]` is a preview *override*, not a preview *target* key such as
> `preview.command` or `preview.targets[]`. Keep target keys under `[preview]`
> itself.

### `[check]`

`repoos check` runs a plan your repo declares, so the same gate works for any
stack (Go, Gradle/Android, Rust, JavaScript, or a mix):

```toml
[check]
version = 1
uiStylesheet = "src/styles.css"
backdropToken = "--bg"
gradientTokens = ["--btn-primary-bg"]

[[check.steps]]
name = "build"
command = "go build ./..."
requires = ["go"]
timeoutMs = 300000

[[check.themeScopes]]
selector = ":root"
name = "dark"
inherits = ["dark"]

[[check.contrastPairs]]
fg = "--txt"
bg = "--bg"
```

A step runs `command`, or a built-in `kind` (see
[Checks before merge](/check) for the kinds and their skip conditions). With no
`[[check.steps]]` at all, the gate falls back to the legacy keys below, then to
inference from repo markers — and a repo with no recognisable plan fails rather
than reporting green. (`[checks]` is accepted as an alias for `[check]`.)

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `check.version` | number | `1` | yes | Check-plan schema version. |
| `check.defaultProfile` | string | `default` | yes | Profile used when `--profile` isn't passed. |
| `check.steps` | array of tables | unset | yes | The plan: one row per gate step, run in order. Fields below. |
| `check.steps.name` | string | derived from `kind` | yes | Identifies the step in output and in `dependsOn`. |
| `check.steps.command` | string | unset | yes | Shell command to run. |
| `check.steps.kind` | select | unset | yes | Built-in guard instead of a command. |
| `check.steps.cwd` | string | repo root | yes | Repo-relative directory to run in. |
| `check.steps.timeoutMs` | number | `600000` | yes | Kill the step after this long. |
| `check.steps.required` | boolean | `true` | yes | `false` makes a failure advisory instead of gating. |
| `check.steps.profiles` | array of strings | all profiles | yes | Profiles that include this step. `["full"]` keeps it out of a routine run; close-out runs `--profile full`. |
| `check.steps.whenChanged` | array of strings | always runs | yes | Path globs; in changed-path mode the step runs only when one matches. |
| `check.steps.requires` | array of strings | unset | yes | Binaries that must be on `PATH`; a missing one fails a required step with install advice. |
| `check.steps.dependsOn` | array of strings | unset | yes | Skip this step when a named earlier required step failed. |
| `check.uiSmoke` | string | unset | yes | Command for the UI smoke step. Overrides a `smoke` script in `package.json`; with neither, the step skips. |
| `check.uiStylesheet` | string | unset | yes | Repo-relative stylesheet the CSS-layering and theme-contrast guards read. With it absent, both skip. |
| `check.themeScopes` | array of tables | unset | yes | Theme blocks for the contrast guard. Each row is documented just below. |
| `check.themeScopes.selector` | string | required | yes | CSS selector that opens the block, e.g. `:root[data-ui-theme="clear"]`. |
| `check.themeScopes.name` | string | required | yes | Variant name used in failure messages, e.g. `clear-dark`. |
| `check.themeScopes.inherits` | array of strings | `[name]` | yes | Names of earlier scopes whose declarations this scope inherits, in order (later wins). |
| `check.contrastPairs` | array of tables | unset | yes | Foreground/background token pairs checked for contrast. |
| `check.contrastPairs.fg` | string | required | yes | Foreground token, e.g. `--txt`. |
| `check.contrastPairs.bg` | string | required | yes | Background token, e.g. `--bg`. |
| `check.gradientTokens` | array of strings | unset | yes | Tokens consumed as `background-image`, which must resolve to a gradient. |
| `check.backdropToken` | string | unset | yes | Token to composite semi-transparent colors over before measuring luminance. |
| `check.bareRequireDirs` | array of strings | tsconfig `include` | yes | Source roots the bare-`require()` guard scans. Absent, it uses the repo's tsconfig `include`/`files` minus `exclude`. |
| `check.bareRequireExcludes` | array of strings | tsconfig `exclude` | yes | Paths or globs the bare-`require()` guard skips. Consulted only with `bareRequireDirs`. |

See [Checks before merge](/check) for what each step does and when it runs.

## Authentication

```toml
[auth]
enabled = false
sessionMaxAge = 2592000
bootstrapAdmin = "you@example.com"

[auth.emailProvider]
type = "resend"
fromAddress = "otp@send.example.com"

[auth.google]
clientId = "your-client-id.apps.googleusercontent.com"
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `auth.enabled` | boolean | `false` | yes | Whether login is required. Takes effect on the next `repoos serve`. |
| `auth.sessionMaxAge` | number | `2592000` (30 days) | yes | Session lifetime. Values under 300 are read as days; values of 300 or more as seconds. |
| `auth.bootstrapAdmin` | string | unset | yes | Admin email used to claim the first account on a fresh install. Cleared after bootstrap. |
| `auth.emailProvider.type` | select | unset | yes | Email OTP provider. The only supported value today is `resend`. |
| `auth.emailProvider.fromAddress` | string | unset | yes | Sender address for email OTPs. Not sensitive. |
| `auth.emailProvider.fromName` | string | unset | yes | Optional sender display name; defaults to `RepoOS at <repo>`. |
| `auth.google.clientId` | string | unset | yes | Optional Google OAuth client ID. Not sensitive. |

Auth secrets belong in `.env`, never in committed config — the Settings API
refuses to write them to `repoos.toml`:
`REPOOS_RESEND_API_KEY`, `REPOOS_GOOGLE_CLIENT_SECRET`,
`REPOOS_AUTH_SESSION_SECRET`, and the local-only
`REPOOS_AUTH_DEV_BACKDOOR_CODE`. See [Authentication](/authentication) for setup
and [Environment and secrets](/environment-and-secrets) for the secret contract.

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

The `[release]` block is dormant — and the Releases UI hidden — unless
`release.enabled = true`. RepoOS only reads the other `release.*` keys once it
sees a boolean `enabled`.

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `release.enabled` | boolean | `false` | yes | Turns the Releases UI and API on. |
| `release.provider` | select | `git-tag` | yes | Release provider. The only supported value today is `git-tag`. |
| `release.name` | string | unset | yes | Optional display name for the release surface. |
| `release.branch` | string | `main` | yes | Branch a release must be cut from. |
| `release.versionFile` | string | unset | yes | Project manifest holding the committed semantic version. |
| `release.tagPrefix` | string | `v` | yes | Prefix prepended to the version for the git tag. |
| `release.remote` | string | `origin` | yes | Git remote that receives the annotated tag. |
| `release.repository` | string | unset | yes | Optional `owner/repo`, used only to link to the resulting release. |
| `release.workflow` | string | unset | yes | Optional workflow path shown as release context. RepoOS does not execute it. |

### Deployment rows

```toml
[[deployments]]
name = "Dashboard (prod)"
service = "Dashboard"
branch = "prod"
provider = "cloudflare-workers"
url = "https://app.example.com"
dashboard_url = "https://dash.cloudflare.com/…"
subdir = "app"
```

Each `[[deployments]]` row models one service-and-branch pair and turns the
Deployments nav item and API on. A row missing `name` or `branch` is dropped.

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `deployments.name` | string | required | yes | Human label, e.g. `Dashboard (prod)`. |
| `deployments.service` | string | `name` | yes | Groups rows of the same service across branches into one row with a column per branch. |
| `deployments.branch` | string | required | yes | Branch whose pushes deploy this target. |
| `deployments.provider` | string | unset | yes | Provider label, e.g. `cloudflare-workers`. Informational only. |
| `deployments.url` | string | unset | yes | The live target, rendered as the row's primary link. |
| `deployments.dashboard_url` | string | unset | yes | Optional provider-dashboard URL. Note the snake_case spelling. |
| `deployments.subdir` | string | unset | yes | Repo subdirectory this service lives in, scoping the freshness lookup so an unrelated push doesn't read as a deploy. |

### Distribution destinations

```toml
[[distribution]]
name = "npm"
kind = "npm"
package = "@scope/package"
url = "https://www.npmjs.com/package/@scope/package"
install = ["npm install -g @scope/package"]
```

A release can list one or more install destinations, shown in the Releases
page's **Published to** section. `name` is required; other rows are validated
and dropped rather than poisoning the section.

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `distribution.name` | string | required | yes | Human channel name, e.g. `npm` or `GitHub Releases`. |
| `distribution.kind` | select | unset | yes | Public version lookup: `npm`, `homebrew`, `github-release`, or `custom`. An unrecognized value means no automatic check. |
| `distribution.url` | string | unset | yes | Source link for the channel. Must start with `http(s)://`; may contain `{tag}` or `{version}`. |
| `distribution.package` | string | unset | yes | Package/formula identifier, used as the lookup key for `kind = "npm"`. |
| `distribution.repository` | string | unset | yes | `owner/repo` for `kind = "github-release"`. |
| `distribution.versionUrl` | string | unset | yes | Explicit URL to fetch the published version from. Required for `homebrew` and `custom`. |
| `distribution.versionRegex` | string | unset | yes | Regex with one capture group used to read the version. Must compile; invalid patterns are dropped. |
| `distribution.install` | array of strings | unset | yes | Install commands, each independently copyable. |

See [Deployments and releases](/deployments-and-releases) for how these render.

## Stories

```toml
[stories]
enabled = false
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `stories.enabled` | boolean | `false` | yes | Turns the Stories page, its navigation item (between Work and Checks), and the task drawer's Story field on. |

Stories are an optional grouping over tasks: a delivery slice that spans several
technical areas and owners. You can **register a story up front** with a markdown
file under `stories/` (from the Stories page **New story** flow, or by adding a
file in git), and/or tag tasks with a matching `story:` value in frontmatter —
from the task drawer's Story field, or with `repoos new "…" --story "Project
updates email"` / `repoos update <id> --story "Project updates email"`. Task
tags drive counts, progress, and completion; definition files add name and
description before any task exists. A story has no worktree, agent, branch, or
status of its own. The Stories page merges registered definitions with tagged
tasks.

**New story** saves and commits the story file as soon as you submit, so you
can leave the pane and `stories/` never leaves `main` with uncommitted changes.
The PM agent then works in the background: it names the story (unless you gave
it a name), writes up the scope, and tags any existing untagged tasks that
belong to it. The story shows **PM is working** on the Stories page until the
agent finishes. If the agent fails, the story stays as you wrote it and the
reason appears in a notification.

A story counts as complete only when every one of its tasks is done, and there
is no manual completion control.

Story names are whitespace-normalized and matched case-insensitively, so
`Project updates email` and `project  updates  email` group together under one
stable display name. Clearing the field removes the task from every story.

### A story is not an area

`area` describes **where work lands** — the part of the product or codebase a
task touches (`web`, `core`, `cli`, `api`), and it drives preview-target
selection. A `story` describes **what outcome the work serves**, and it can
span any number of areas. The project-updates email list, for example, can be
one story whose tasks are individually tagged `neon`, `landing`, and `ops`
areas. Use an area when routing work to the right code; use a story when you
want to see whether a whole customer-visible outcome is ready.

With `enabled` missing, false, or malformed, nothing changes: no nav item, no
route entry point, no Story field in the drawer, and no extra API work.

## Notifications

```toml
ntfyEnabled = false
ntfyTopic = ""
ntfyBaseUrl = "https://ntfy.sh"
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `ntfyEnabled` | boolean | `false` | yes | Whether RepoOS publishes task lifecycle events to an [ntfy](https://ntfy.sh) topic. |
| `ntfyTopic` | string | `""` | yes | Topic name. Empty means nothing is published. |
| `ntfyBaseUrl` | string | `https://ntfy.sh` | yes | Base URL for a self-hosted ntfy server. The `NTFY_BASE_URL` environment variable overrides it. |

## Tunnels

```toml
[tunnel]
enabled = false
provider = "cloudflare"
name = "repoos-local"
domain = ""
tunnel_id = "<your-tunnel-uuid>"
```

The `[tunnel]` block is the committed record of what this repo publishes through
Cloudflare Tunnel. It is **managed by `repoos tunnel`** — use the CLI rather
than editing it by hand. See [Tunnels](/tunnels).

The Settings page surfaces the master switch as the flat `tunnelEnabled` field;
in `repoos.toml` it is `[tunnel] enabled`.

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `tunnel.enabled` | boolean | `false` | yes | UI opt-in only. Disabling never deletes configuration or stops `cloudflared`. |
| `tunnel.provider` | string | `cloudflare` | yes | Tunnel provider. Only Cloudflare is supported. |
| `tunnel.name` | string | `repoos-local` | yes | Machine-local tunnel name (one tunnel per machine). |
| `tunnel.domain` | string | `""` | yes | Base domain used to infer hostnames. |
| `tunnel.tunnel_id` | string | `""` | yes | The `cloudflared` tunnel UUID. Note the snake_case spelling (`tunnel_id`), which is what `repoos tunnel` reads and writes. |
| `tunnel.apps.<name>` | table | `{}` | yes | One published app per key: `hostname`, `service`, an `access` email allowlist, and an optional `noAccess` flag. Written by `repoos tunnel create`. |

The `CLOUDFLARE_API_TOKEN` credential is environment-only and never belongs in
`repoos.toml`.

## Remote validation

```toml
[remoteValidation]
enabled = false
serverType = "cax31"
location = "hil"
snapshotId = ""
sshKeyName = ""
idleShutdownMinutes = 8
maxServerLifetimeMinutes = 120
fallbackToLocal = false
useForReleases = false
```

Remote validation is opt-in and off by default. It runs the expensive half of
the close-out gate (build + tests) on a disposable Hetzner VM instead of your
machine. Enabling it sends repo contents to a third-party host.

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `remoteValidation.enabled` | boolean | `false` | yes | Master switch for the remote runner. |
| `remoteValidation.provider` | string | `hetzner` | yes | Runner backend: `hetzner` (disposable cloud VM) or `tailscale` (persistent tailnet machine). |
| `remoteValidation.tailscaleHost` | string | unset | yes | Tailscale hostname or 100.x.x.x IP of the runner machine (Tailscale provider only). |
| `remoteValidation.tailscaleUser` | string | `root` | yes | SSH user on the tailscale host (Tailscale provider only). |
| `remoteValidation.containerImage` | string | `repoos-ci` | yes | Docker image to run the gate in (Tailscale provider only). |
| `remoteValidation.serverType` | string | `cax31` | yes | Hetzner server type. Must match the architecture the snapshot was built on. |
| `remoteValidation.location` | string | `hil` | yes | Hetzner location slug. |
| `remoteValidation.snapshotId` | string | unset | yes | ID or name of the prebuilt Hetzner snapshot the runner boots from. |
| `remoteValidation.sshKeyName` | string | unset | yes | Name of the SSH key registered in the Hetzner project. |
| `remoteValidation.idleShutdownMinutes` | number | `8` | yes | How long a warm server stays alive after a job so queued jobs reuse it. |
| `remoteValidation.maxServerLifetimeMinutes` | number | `120` | yes | Hard cost stop-loss: any runner older than this is force-deleted. Minimum `10`. |
| `remoteValidation.fallbackToLocal` | boolean | `false` | yes | When the runner is unreachable, run the full gate locally instead of keeping the task in review for retry. |
| `remoteValidation.useForReleases` | boolean | `false` | yes | Also validate release cuts on the runner. Off by default because a release is watched live. |
The `HETZNER_API_TOKEN` and `REPOOS_REMOTE_SSH_KEY` credentials are
environment-only.

## Summary

Commit project behavior in `repoos.toml`, keep secrets in a gitignored `.env` or
the machine environment, and treat a `REPOOS_`-prefixed variable as an override
only when it is documented as a supported one. For the complete secret contract,
read [Environment and secrets](/environment-and-secrets).
