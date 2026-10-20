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

`repoos.toml` is deliberately small and flat. Nested sections use `[section]`
headers and arrays of tables use `[[section]]` rows. The parser supports any
valid TOML scalar string form: basic (`"..."`), literal (`'...'`), multi-line
basic (`"""..."""`), and multi-line literal (`'''...'''`). Multi-line arrays
and inline tables are not accepted; the only place the parser accepts both
`[check]` and `[checks]` spellings is the `[check]` section, kept for backwards
compatibility.

A write from Settings or `repoos config set` rewrites the rows it touches as
single-line basic strings (`"..."`), so a hand-written `'''...'''` value keeps
the same decoded text — only its quoting style may change. Rows it does not
touch are preserved byte-for-byte, including their multi-line strings.

The Settings UI edits the most common fields directly, and its raw
`repoos.toml` editor can edit the whole file — including `[preview]`, `[check]`,
`[release]`, `[stories]`, `[[deployments]]`, `[[distribution]]`, `[worktrees]`,
`[tunnel]`, and anything the tabs don't surface. On the Settings page, use
**Search settings** in the page header (or press ⌘K / Ctrl+K while on Settings)
to jump to a control by name, config key, or section — a result links to the
named section that holds it. The General tab is split into named sections, each
with its own URL (for example `/settings?tab=general&section=model-routing`),
so a section can be linked directly the way a task can. Keys that only exist in
the raw file open the **repoos.toml** tab. The global top-bar search (⌘K
elsewhere) still searches tasks, docs, and settings together.

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
storiesDir = "stories"    # story definitions (when [stories] is on)
cacheDir = ".repoos"      # derived state; safe to delete
taskExtensions = [".md"]  # file extensions treated as tasks

# ── Board behavior ───────────────────────────────────────────────────────
defaultStatus = "inbox"        # draft | inbox | ready | active | review | done
defaultAssignee = "ai"         # unassigned | ai | human
defaultTaskMode = "freeform"   # freeform | manual
maxActiveTasks = 3             # 1-20; used when auto-engineering is on
autoEngineeringMode = false
skillSuggestions = false
worktreeWarnThreshold = 20     # 0 disables the warning

# ── Server and UI ────────────────────────────────────────────────────────
servePort = 7171   # omit to derive a stable per-repo port (7200-7999)
activityAnimationStyle = "orbital-pixel"   # compact agent-activity indicator; see table below
activityAnimationSize = "16"               # fixed pixels: 8, 12, 16, 20 or 24; see table below
strictBuild = false

# ── Close-out (Move to done) ─────────────────────────────────────────────
closeOut.timeoutMs = 360000  # 6-minute budget per close-out attempt; 0 = no limit

# ── Budget controls (agent drivers) ──────────────────────────────────────
# Steer agent drivers (CLI/API sessions) to a human-approved subset of
# coding agents + models. Empty = unrestricted. Pause an entry with
# paused/pausedUntil/pausedReason (agent) or pausedModels (one model)
# instead of deleting it. Edit on the Agents page's Budget Controls tab,
# or as [[budget.allowlist]] rows here.
# [[budget.allowlist]]
# cli = "opencode"
# models = ["big pickle", "deepseek v4"]
# paused = false

# ── Approval policy (opt-in; default off) ────────────────────────────────
# approval.enabled = true
# approval.autoApprove.areas = ["api", "data", "docs", "chore"]
# approval.autoApprove.types = ["chore"]
# approval.autoApprove.uiAreas = ["web", "ui-app", "frontend"]
# approval.autoApprove.machineryPaths = ["src/server/", "src/core/", ".githooks/", "repoos.toml", "AGENTS.md"]
# approval.autoApprove.allowP0 = false   # p0 always needs a human

# ── Autopilot kill switch ────────────────────────────────────────────────
# automation.paused = false   # true halts every automatic CTO/policy action

# ── Agents ───────────────────────────────────────────────────────────────
maxConcurrentAgents = 5  # omit to size from this machine's CPU count
ctoSkipHealthy = true    # skip the CTO model call while the board is healthy
# cto.actions = []       # opt-in allowlist: restart-stalled-agent, refresh-main-install, requeue-closeout-after-env-fix

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

# ── Areas (optional task-area vocabulary) ─────────────────────────────────
[[areas]]
name = "web"
description = "The main web app"
[[areas]]
name = "cli"

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
isolationRuns = 3              # re-run a failing test file alone this many times
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

# ── Stories (cross-area delivery tracking, on by default) ────────────────
[stories]
enabled = true            # false hides the Stories page and task Story field
excerptBytes = 4096       # bytes of story definition agents see in their prompt

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
retryOtherHosts = true         # retry on another healthy tailscale host before giving up (default true with 2+ hosts)
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
schedulesDir = "schedules"
storiesDir = "stories"
cacheDir = ".repoos"
taskExtensions = [".md"]
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `workDir` | string | `work` | yes | Directory holding task markdown files, relative to the repo root. This is the board. |
| `docsDir` | string | `docs` | yes | Directory holding context docs an agent reads before working. |
| `skillsDir` | string | `skills` | yes | Directory holding reusable skills (`skills/<name>/SKILL.md`). |
| `inputsDir` | string | `inputs` | yes | Directory holding user-submitted inputs and their attachments. Must be repo-relative; an absolute or escaping value falls back to the default with a warning. |
| `schedulesDir` | string | `schedules` | yes | Directory holding scheduled task definitions (Agents → Scheduled Tasks). Must be repo-relative; an absolute or escaping value falls back to the default with a warning. |
| `scheduledTasks.enabled` | boolean | `false` | no | When true, the control-plane server runs enabled schedules on a cadence. Off by default; previews and task worktrees never run schedules. |
| `storiesDir` | string | `stories` | yes | Directory holding story definitions (used when Stories are enabled). Must be repo-relative; an absolute or escaping value falls back to the default with a warning. |
| `cacheDir` | string | `.repoos` | yes | Derived state only — logs, indexes, cached databases. Delete it and RepoOS rebuilds from the task files; nothing of record is lost. |
| `taskExtensions` | array of strings | `[".md"]` | yes | File extensions treated as tasks. |

All paths are relative to the repo root. `repoos.toml` and `AGENTS.md` always
stay at the root regardless of how these are set. Changing `workDir`,
`cacheDir`, or `taskExtensions` triggers an index refresh.

These configured paths are **authoritative**: RepoOS and the agents it runs read
the board and project docs from exactly these directories. If another tool or a
set of project docs assumes a different layout, change `repoos.toml` (or
reconcile the docs) — never move the directories so the config no longer matches
where your content lives.

On the `repoos/` layout, `repoos init` writes `workDir`, `docsDir`,
`skillsDir`, `storiesDir`, `inputsDir` and `cacheDir` together, all under the
namespace, so every RepoOS-owned directory stays in one place. A layout where
`workDir` is namespaced but `storiesDir` is still top-level (as init wrote
before #0703) scatters stories to the repo root; `repoos doctor` warns about that
mismatch and suggests `storiesDir = "<namespace>/stories"`, but never moves
anything for you.

## Board behavior

```toml
defaultStatus = "inbox"
defaultAssignee = "ai"
defaultTaskMode = "freeform"
maxActiveTasks = 3
autoEngineeringMode = false

[autoEngineering]
pmVeto = false

skillSuggestions = false
worktreeWarnThreshold = 20
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `defaultStatus` | select | `inbox` | yes | Status new tasks start in. One of `draft`, `inbox`, `ready`, `active`, `review`, `done`. |
| `defaultAssignee` | select | `ai` | yes | Default assignee for new tasks: `unassigned`, `ai`, or `human`. Defaults to `ai`, so new tasks are picked up by an agent; existing tasks keep their own assignee. |
| `defaultTaskMode` | select | `freeform` | yes | New-task flow: `freeform` (the AI writes the task) or `manual` (a form). Any other value falls back to `freeform`. |
| `maxActiveTasks` | number | `3` | yes | Cap on simultaneously active tasks when `autoEngineeringMode` is on. Must be 1–20. |
| `autoEngineeringMode` | boolean | `false` | yes | When true, RepoOS **event-driven** dispatch starts ready tasks automatically, up to `maxActiveTasks` (see below). |
| `autoEngineering.pmVeto` | boolean | `false` | yes | Off by default: selection is fully deterministic (priority, then critical-path weight, then creation order). When on, a PM pass runs only when there are more eligible ready tasks than open slots **and** two candidates would collide (same area or a declared shared path); it may reorder or defer, never invent work. |
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
the six column labels shown in the UI and CLI. You can edit them from
**Settings → Advanced → Work board column labels**; clearing a field restores
that column's default. These are display labels only: the canonical status IDs
never change, and transitions, frontmatter, and API/CLI status inputs are
unaffected.

### Auto-engineering mode (`autoEngineeringMode`)

When `autoEngineeringMode = true`, the server runs a **dispatch pass** whenever
something frees capacity or new work becomes eligible:

- a task leaves `active` for `review` (a slot opens),
- a task moves from `inbox` to `ready`,
- a dependency lands on `main` (`dependency-merged` trigger),
- the server starts up,
- or `autoEngineeringMode` / `maxActiveTasks` changes in config.

Each pass:

1. Counts active tasks (not archived) and computes free slots up to
   `maxActiveTasks`.
2. Builds the **candidate list**: `ready` tasks that are not archived, not
   `needs_input`, not held (`hold: true` or a `hold` tag), and have no unmet
   `dependsOn` blockers.
3. Orders candidates **deterministically**: priority, then critical-path weight
   (transitive dependents on the full board), then creation order, then task id;
   takes as many as fit in the open slots.
4. When `autoEngineering.pmVeto` is on and there are more eligible tasks than
   slots **and** two candidates would collide (same area or a declared shared
   `paths` entry), calls the **PM agent** once (recorded as a `dispatch`
   session) to reorder or defer only — never to invent tasks. On PM failure, the
   deterministic order stands.
5. Starts the selected tasks through the normal `/start` path.

Outcomes (`no-capacity`, `no-ready-work`, `selected`, …) and which picker ran
are persisted for the Control page. This is optional automation — default is
off.

### Task body sections (underspecified check)

RepoOS can flag stub tasks with `needs_input` / `underspecified`. A well-formed
task body normally includes these headings (each with real prose, not placeholders):

- `## Problem`
- `## Desired UX` — **required only when the task's `area` includes a UI slice**
  (`web`, `ui`, or `ui-app`). Pure server/docs/cli tasks may omit it.
- `## Acceptance criteria`
- `## Notes for AI`

The body outside `## Original prompt` should be at least ~400 characters. The PM
"flesh this out" flow and `repoos new` / task PATCH paths run the same check.

RepoOS also flags `needs_input` / `needs-human-step` when `## Acceptance criteria`
mention real devices, physical hardware, accounts, credentials, or third-party
registrations — a hint to split that verification into a human-only task.

Both checks are agent-oriented. A task assigned to a human (`--assigned-to
human`) is the human's own checklist: it skips both, `## Notes for AI` is
optional for it, and its acceptance criteria are still shown. An AI task that
trips the `needs-human-step` keyword check by accident can be cleared on purpose
with a recorded reason — `repoos new/update --human-step-override "<reason>"` —
which stores the reason on the task and writes it to the activity log. The
matched keywords stay listed in `needs_input_detail` until that override is set.

Constraints: a label is a string of at most 40 characters; blank labels,
duplicates of another column's label, or over-length values fall back to that
column's default. Any column you don't override keeps its default. The default
labels are `Draft`, `Inbox`, `Ready`, `Active`, `Review`, `Done`.

## Server and UI

```toml
servePort = 7171
strictBuild = false
activityAnimationStyle = "orbital-pixel"
activityAnimationSize = "auto"
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `servePort` | number | derived per repo | yes | Port `repoos serve` binds by default. If omitted, RepoOS derives a stable port from the repo's path in the 7200–7999 range, so two checkouts never collide. Must be 1–65535. `--port` on the command line overrides it. |
| `strictBuild` | boolean | `false` | yes | When true, a stale build makes `repoos` exit with an error instead of printing a warning. `REPOOS_STRICT_BUILD=1` (environment) and the `--strict-build` flag do the same without changing the file. |
| `activityAnimationStyle` | select | `orbital-pixel` | yes | Motion beside coding, reviewing, and other agent-activity labels in the web UI. Values: `orbital-pixel` (default compact orbit), `cursor-scan-pulse`, `breathing-brackets`, `micro-dot-matrix`, `tiny-signal-bars`, `spark-diamond`, `arcade-hopper` (alien that jumps and tilts), `puppy-tracks` (two alternating paw prints), `bird-quick-trail` (fast alternating bird footprints), `rgb-keystorm` (multicolor keyboard with a moving key wave, typing fingers and rising code), `wheelie-courier` (motorcycle and rider doing repeated wheelies), `boo-swoop` (ghost swooping with a rippling hem and orbiting wisps), `pumpkin-spell` (bouncing jack-o'-lantern with a witch hat and rising sparks), or `three-dots` (legacy horizontal dots). Omitted config uses `orbital-pixel`. Edit in **Settings → General → Activity animation**; the page previews all three activity states before save. Honors `prefers-reduced-motion` with a static indicator. |
| `activityAnimationSize` | select | `16` | yes | Fixed pixel width of the activity animation, rendered at the same size on every surface (task cards, the Dev page and the Settings preview) regardless of the surrounding font. Values are the quoted strings `"8"`, `"12"`, `"16"`, `"20"`, `"24"`; a hand-written numeric TOML value (`16`) is normalized to the same value. Omitted config uses `16`. Legacy character-width values (`"auto"`, `"1"`–`"3"`) still load and are mapped onto the pixel ladder by ordinal, so existing configs keep their relative size. Edit in **Settings → General → Activity animation** with a single slider (no Auto toggle; the default is marked with a tick); the preview updates live. Honors `prefers-reduced-motion` at every size. |

Appearance is **not** a `repoos.toml` setting. The dark/light/system theme and
the UI design language are per-browser preferences stored in the browser, so
they never travel with the repo.

## Attention (notification bell)

```toml
attention.spendAlertUsd = 0
attention.slowRunMultiplier = 1.5
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `attention.spendAlertUsd` | number | `0` | yes | When provider-reported board spend reaches this USD total, the notification bell shows a spend alert. `0` disables the alert. Estimates and unknown costs are never counted. Edit it in **Settings → Notifications**. The same feed is available as `GET /api/attention` (see [Notices and notifications](/notifications)). |
| `attention.slowRunMultiplier` | number | `1.5` | yes | While a check, handoff gate, close-out stage, or bundle upload is running, flag it in the bell when elapsed time exceeds this multiple of the median of recent passing runs of the same kind (at least five samples). Must be ≥ 1. Edit it in **Settings → General**. See [Checks — slow-run alerts](/check#slow-run-alerts-0720). |

## Close-out (Move to done)

```toml
closeOut.timeoutMs = 360000
closeOut.gate = "scoped"              # "scoped" (default) | "reuse" | "full"
closeOut.candidate = "symlink-main"   # or "own-install"
closeOut.installCommand = ""          # optional shell install for candidates / main refresh
closeOut.postPublishCommand = ""      # optional shell install in main after lockfile-changing merges
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `closeOut.timeoutMs` | number | `360000` (6 min) | yes | Total wall-clock budget for **one** close-out attempt — from when the job leaves the queue until it reaches `failed`, `done`, or is removed by a user cancel. A close-out that runs past it is aborted: in-flight build/check/publish children are killed, the throwaway candidate worktree is torn down, and the job is recorded as a retryable `failed` whose reason starts `close-out timed out after …`. The task stays in `review` with its feature branch and worktree untouched, so **Move to done** can be retried. The single validating retry, main-drift resyncs, and remote validation (host-pool queue wait included) all spend the **same** budget, and per-step child timeouts are capped to whatever budget remains. `0` disables the ceiling (the unbounded pre-#0573 behaviour). Invalid or negative values are ignored with a `[closeOut] timeoutMs …` console warning and fall back to the default. |
| `closeOut.gate` | string | `"scoped"` | yes | How much of the merge gate a Move to done re-runs (#0724). The candidate already passed the identical full gate at handoff, so the close-out compares the candidate tree against the tree the handoff gate recorded and picks a mode. `"reuse"` runs the cheap steps and skips the suite when the candidate tree is identical to the tested tree or main advanced with bookkeeping only; `"scoped"` (default) reuses in those cases and otherwise runs `repoos check --changed <tested base>`; `"full"` always runs the whole suite. Releases and paths under `check.fullSuitePaths` always run the full suite, and a scoped failure is retried once as the full suite. Invalid values are ignored with a warning and fall back to `"scoped"`. |

Edit it in **Settings → General → "Close-out timeout"** (presets plus *Off (no
limit)*), or set any value directly in `repoos.toml`. A timeout is a failure
with an error card; **Stop MTD** on the task drawer is a user cancel and stays
badge-free — see [docs/close-out-pipeline.md](../docs/close-out-pipeline.md)
for how the three outcomes differ.

| `closeOut.candidate` | string | `symlink-main` | yes | How the throwaway **candidate** worktree gets dependencies. `symlink-main` reuses the primary checkout's `node_modules` (fast). `own-install` runs a frozen install in the candidate — use for monorepos or when Vite reports `Denied ID` on symlinked paths. `[worktrees] candidate` is an alias when `closeOut.candidate` is unset. |
| `closeOut.installCommand` | string | *(empty)* | yes | Optional shell command to install dependencies for candidates, and to refresh main after a lockfile-changing merge when `postPublishCommand` is empty. When empty, RepoOS infers `bun install --frozen-lockfile`, `npm ci`, etc. from lockfiles. |
| `closeOut.postPublishCommand` | string | *(empty)* | yes | Shell command run in the **primary checkout** after a merge that changed `package.json` or a lockfile. Replaces the automatic lockfile install — use for Python venvs, Cargo, or other stacks. |

Edit **Close-out candidate dependencies**, **Close-out install command**, and
**Post-merge install command** in **Settings → General**.

## Budget controls (agent drivers)

An *agent driver* is an AI session that operates RepoOS through the CLI/API —
overriding engineers, starting tasks, restarting stuck runs. It has repeatedly
picked agent + model pairs that are too expensive. This optional allowlist
steers an agent driver to a human-approved subset; a human using the web UI is
**never** restricted and keeps the full list. Leave it empty and nothing is
restricted — agent drivers behave exactly as they do today.

```toml
[[budget.allowlist]]
cli = "opencode"
models = ["big pickle", "deepseek v4"]

[[budget.allowlist]]
cli = "claude code"
models = ["sonnet"]
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `budget.allowlist[].cli` | string | *(required)* | yes | A coding-agent CLI id (the `AGENT_CLIS` string, e.g. `opencode`, `claude code`). An agent driver may only use a listed CLI. |
| `budget.allowlist[].models` | array of strings | *(required)* | yes | The model ids allowed for that CLI. A model not listed is refused. Rows for the same `cli` are merged; a row with no models is dropped. |
| `budget.allowlist[].paused` | boolean | `false` | yes | Pauses the whole agent (every model on the row) without removing it. A paused entry is never selected by defaults, Start, dispatch, failover or agent drivers. |
| `budget.allowlist[].pausedUntil` | ISO date/time | *(none — indefinite)* | yes | When the pause ends. The entry resumes automatically at that time with no restart. |
| `budget.allowlist[].pausedReason` | string | *(none)* | yes | Free-text reason shown with the Paused chip and in fallback logs. |
| `budget.allowlist[].pausedModels` | array of strings or `{ model, pausedUntil?, pausedReason? }` | *(none)* | yes | Pauses individual models. Use the object form to give one model its own resume date/reason. A bare `"default"` model selection is treated as paused if any model on its row is paused (fail closed). |

Edit it on the **Agents page → Budget Controls tab**
(`/agents?tab=budget-controls`), which lists each allowed agent with its models
collapsed by default and adds entries through the shared coding agent + model
selector. Each row and model chip has **Pause** / **Resume** controls; Pause
opens a dialog for an optional resume date/time and reason. From a driver shell,
use `repoos agents pause <agent> [--model <model>] [--until <date>] [--reason "…"]`
and `repoos agents resume <agent> [--model <model>]`. The `budget.allowlist` key
is also in the Settings schema so search can find it.

When an allowlist entry is paused, selection falls back to the next allowed
pair that is not paused and records the swap (and the reason) in the task's
activity log. If every allowed pair is paused, starting a task fails with
"All allowed agent+model pairs are paused" instead of retrying the same broken
pair. A per-task override a **human** set in the UI keeps working even if that
pair is paused; an agent driver's attempt to set a paused override is refused.

Enforcement: when an agent driver sets an engineer/reviewer override
(`repoos override <id> --cli … --model …`, or a direct
`PATCH /api/tasks/:id` with `cliOverride`/`modelOverride`) to a pair outside the
allowlist, the server refuses with a clear error listing every allowed pair.
The server tells an agent driver from a human by the loopback CLI token: a
browser UI session never carries it, so the human path always falls through.
`repoos override --help` prints the allowlist so a driver can choose an allowed
pair.

## Adaptive model routing (`[model_routing]`)

An optional decision model can choose the coding agent and model for PM,
engineer and reviewer runs. It is **off by default**: with the section unset,
RepoOS uses the configured role defaults and task overrides exactly as before.

> **Shipped (#0791 + #0792 + #0793):** `src/core/model-routing/` (System One
> codec, TypeSafe Jev and OpenRouter adapters, candidate filter, policy,
> handback re-evaluation, restart-safe decision records), the six
> `model_routing.*` keys in `getConfigSchema()`, TOML parsing, and the **Model
> routing** tab on the Agents page (provider, mode, roles, timeout, credential
> presence, configuration probe, and recent decisions). Routing is now invoked
> on the PM, engineer and reviewer run paths (including review handback). #0812
> gives the decision model real inputs (a context-budgeted brief, per-candidate
> model facts and project history, task progress, and a stated objective). The
> only remaining follow-up is the human-only live credentialed smoke test
> (**#0794**). A self-hosted Clef-Flash adapter is retained in the code and its
> fixtures, but it is not a selectable provider (#0809).

```toml
[model_routing]
mode = "shadow"              # off | shadow | automatic
provider = "jev"             # jev | openrouter
model = "jev-latest"         # or a pinned id such as "jev-1.13.0"
roles = ["engineer", "reviewer", "pm"]
timeoutMs = 8000             # 500–60000
humanStepCheck = false       # ask before a ready task starts (default off)
```

| Key | Default | Meaning |
| --- | --- | --- |
| `model_routing.mode` | `off` | `off` never calls the router. `shadow` records a recommendation for each decision but **never changes the selection**. `automatic` applies the recommendation, within the budget allowlist and role limits. |
| `model_routing.provider` | `jev` | Which decision backend answers: direct TypeSafe Jev or OpenRouter System One. |
| `model_routing.model` | `jev-latest` | Provider model id. |
| `model_routing.baseUrl` | — | Retained so an existing `[model_routing]` table with the self-hosted adapter still parses. It has no UI and is not a selectable provider. |
| `model_routing.roles` | all three | Which runs consult the router. A role left out keeps its configured agent. |
| `model_routing.timeoutMs` | `8000` | One decision call's ceiling. A timeout falls back; it never blocks the run. |
| `model_routing.humanStepCheck` | `false` | Before a `ready` task starts, ask the decision model whether it needs steps only a human can do and should be split into an AI task and a human task. Uses the same provider as routing. It only blocks a start when `mode = "automatic"`; in `shadow` it records the verdict without blocking, and when the provider is off, unavailable, or fails, the existing keyword check runs instead — a failure never blocks a task on its own. |

### Choosing a provider

**TypeSafe Jev (hosted, direct).** Jev is served by `POST https://api.typesafe.ai/v1/systemone`
with `Authorization: Bearer <key>`. Get a key from the TypeSafe console, then put
it through the **Model providers** tab on Agents (or the **Model routing** tab's
masked save control). Keys land in the gitignored `.env` under the fixed name
`TYPESAFE_API_KEY` — never in `repoos.toml`.

Set `model_routing.provider = "jev"`.

**OpenRouter (Jev / TypeSafe via System One).** OpenRouter exposes the same
System One contract at `POST https://openrouter.ai/api/v1/systemone`, billed to
your OpenRouter account. Use this when you already have `REPOOS_OPENROUTER_API_KEY`
for the Agents page but not a separate TypeSafe key. Bare ids such as `jev-latest` and `jev-1.14` are mapped in the OpenRouter adapter
to `~typesafe/jev-latest` and `typesafe/jev-1.14` before the request is sent;
ids that already use the `typesafe/` or `~typesafe/` prefix are unchanged. This
is a **distinct provider option** in config (`provider = "openrouter"`), not a
hidden transport inside the Jev adapter — switching between direct Jev and
OpenRouter changes only endpoint and credential env, not the RepoOS routing policy.

```toml
[model_routing]
provider = "openrouter"
model = "jev-latest"
```

Save `REPOOS_OPENROUTER_API_KEY` on the **Model providers** tab — routing reuses
that key, so the Model routing tab shows no key field for it and links to Model
providers instead. When the key is missing, routing reports the credential as not
set and the provider as not ready.

### Secret handling

Routing keys follow the same convention as the other provider keys: they live in
the gitignored `.env` file or the process environment and are never written to
`repoos.toml`, logged, or echoed back to the browser. Env var names are fixed
per provider in the model-providers registry — do not add a free-text “key
variable” field. See `docs/api-keys.md` for the agent-facing checklist.

### Shadow evaluation first

Configure routing on the Agents page (**Model routing** tab) or in TOML, then
start in `mode = "shadow"`. Each eligible run records what the router would have
chosen, the candidates it considered, and the provider's signals, while the run
itself keeps the configured agent. The **Recent decisions** list on the same tab
shows, per run, the role, the configuration actually used, the shadow
recommendation when it differs, the response time, and the provider's token usage
(or dollar cost when it reports one) — rendered from the recorded factors only.
Each card expands (collapsed by default) to the question that was sent and the
answer that came back. Each card's timestamp reads as a relative time
("13 hours ago"); hover or focus it for the exact local time. A fallback is
written in plain words rather than as an error: an insufficient-evidence
fallback says the model was not confident enough and the role default was used,
with the top probability and the threshold. Compare those recommendations with
real outcomes before enabling `automatic`.

The **Test configuration** button checks parsing, provider requirements, and
whether the required key is set — it does not call the hosted API. **Test live
connection** issues one real decision call when you are ready; while it runs it
shows a waiting state, then a result card (green outline on success, red on
failure) that opens collapsed to the summary — the outcome, the model that
answered, the cost or token usage, and the chosen candidate with its probability
— and expands (one click) to the full detail: the test question, the answer and
each option's probability, and the response time. A failure adds a plain reason
and what to check. Use it sparingly and never in automated tests.

### Automatic mode, pins and limits

- An explicit human pin (a task's CLI or model override) always wins; the router
  is not consulted for a pinned run.
- Candidates are filtered **in code**, not by the model, against the budget
  allowlist (`[[budget.allowlist]]`), harness availability and reasoning support.
  An empty allowlist is unrestricted; a non-empty one is a hard ceiling.
- The router cannot widen permissions or budgets. It only chooses among
  candidates that already pass these filters.
- Every decision is persisted under `.repoos/model-routing/decisions.json` and
  survives a server restart. The record keeps the bounded brief that was sent and
  the provider's answers, so a card's details view renders exactly what was asked
  and returned. The decision call's token usage is recorded in the
  Tokens/session accounting under the `routing` session type (never `pm`).

### What the decision model is sent (#0812)

The router used to send a short brief capped at 6,000 characters, three yes/no
questions and a candidate list labelled only `cli / model / reasoning`. It now
sends enough to decide:

- **A brief budgeted to the decision model's context window.** The window is
  looked up from provider metadata and the brief may use a fixed share of it
  (`DEFAULT_ROUTING_BRIEF_SHARE`, 25%), converted at ~4 characters per token.
  When the window is unknown, the safe fixed fallback (6,000 characters) applies.
- **Per-candidate facts.** Each candidate's label carries its price per 1M input
  and output tokens, context size, whether it is subscription or pay-as-you-go,
  and this project's own history for the role (runs, pass rate, average tokens,
  turns, cost and review passes). Unknown fields are omitted rather than shown
  empty, and a `reasoning` level appears only when the candidate actually has one.
- **Task progress.** Engineer and review rounds so far, the latest review
  verdict, diff size, whether UI shots are involved, and time open.
- **An explicit objective.** The suitability question states what "best" means:
  complete this kind of task well (the review passes first time) in the fewest
  rounds, at the lowest cost that still meets that bar.

Prices and context sizes come from a curated, dated snapshot of provider
metadata (`src/core/model-routing/facts.ts`); project history is read from the
project's own sessions database (`src/server/candidate-history.ts`), not
RepoOS's. Each decision record logs the brief size, the budget it was given, the
decision model's context window and the fact line offered for every candidate,
so a decision can be explained afterwards. This does not change who may run:
the budget allowlist, harness checks and human pins are still applied first.

### Review handback re-evaluation

When review sends work back, the router compares continuing the existing
engineer configuration with switching to another eligible one or escalating to
the most capable. The decision uses the recorded review findings and the task's
attempt history, and it is **bounded** — one switch, one escalation, then a human
is asked. It never bypasses review, checks, approval or close-out, and it never
edits a reviewed worktree.

Two rules matter most:

- A failure classified as **infrastructure** (provider error, timeout, missing
  harness, a gate or verification that could not run, a mechanical clamp of the
  reviewer's verdict) is **not** attributed to the coding model — the
  configuration is kept rather than penalized.
- Handback switches and escalations are drawn only from **same-harness**
  alternatives, because a cross-harness switch cannot resume the engineer's
  session id. A switch prefers a genuinely different model; the decision record
  always shows the configuration actually used.

### Candidate filtering (library behavior)

Before any provider call, `filterCandidates` in `src/core/model-routing/candidates.ts`
drops configurations that fail deterministic checks: budget allowlist, harness
availability, reasoning support, **the run's role** (`pm`, `engineer`, or
`reviewer` must appear in the harness's `supportedRoles`), and **required context
size** (`requiredContextTokens` must not exceed the harness's `maxContextTokens`).
The run paths supply those facts from the detection cache (`harness.ts` provides
the static capability table), and `candidate-set.ts` builds the candidate
universe from the allowlist (or the configured agents when the allowlist is
empty), pairing each cli+model with the reasoning levels its harness supports.

### Scoring and missing cost/time (library behavior)

The routing policy scores every candidate on the same components (suitability,
task-intensity, economy). When normalized cost or time is unknown for a candidate,
the policy uses a fixed neutral midpoint (`ROUTING_NEUTRAL_COST_TIME`, currently
`0.5`) rather than omitting economy terms — missing measurements do not penalize
a candidate relative to one with data.

### Fallbacks (library behavior; applied on the run path in #0792/#0793)

When the router cannot produce a trustworthy decision, the run uses the
configured fallback if it is itself eligible, and otherwise stops with a clear
message. On the run paths (`model-routing-wiring.ts`) a fallback or block never
changes the agent: the run proceeds with the canonical configured/pinned agent,
exactly as with routing off. The fallback applies for:

- no eligible candidates (the run is blocked with the reasons);
- a provider error, timeout, or an unreachable server;
- a malformed or unsupported response;
- insufficient evidence (provider confidence below the calibrated floor).

A failing router never silently disables review and never selects a pair the
allowlist forbids.

### Limitations

- Provider confidence is reported by the model; it is not an established measure
  of real-world accuracy. The thresholds are explicit, versioned policy constants,
  and should be calibrated on your own runs before you rely on them.
- Historical outcome data informs the evaluation report; it does not by itself
  make the router learn. Fine-tuning and a full bandit optimizer are out of
  scope.

## Settings import/export

**Settings → Import/Export** copies settings between projects. Choose which of
the five transferable groups to include — the Agent+Model allowlist,
Agent+Model favorites, starred coding agents, starred themes, and remote
validation — and download them as a `repoos_<repo>_export_<timestamp>.toml`
file (saved to the browser's default Downloads folder). On the target project,
drop that file onto the same tab (or choose it) to review what it contains and
apply it: only the settings present in the file change, everything else stays
as it is.

The allowlist and remote validation are written into the target's `repoos.toml`
(the Hetzner provider details transfer too); the favorites and stars are
browser-local and land in the target browser's storage. Per-host OS, labels
and concurrency (`[[remoteValidation.tailscaleHosts]]` row attributes) are
not transferred — only the host list is.

## UI handoff verification

```toml
uiVerification.enabled = true
uiVerification.viewportWidths = [1024, 375]
uiVerification.autoRefreshStaleOnce = true
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `uiVerification.enabled` | boolean | `true` | yes | When enabled, tasks with a shot capture plan run browser checks at handoff (console errors, failed same-origin requests, horizontal overflow, blank captures) before review. It also blocks on missing or wrong visual evidence: a declared `highlight`/`selector` that matched nothing, a login/redirect that landed away from the declared route, or a declared `assert` condition (element count/text) that failed. Missing Playwright skips with a visible note. |
| `uiVerification.autoRefreshStaleOnce` | boolean | `true` | yes | When enabled (default), a reviewer must explicitly mark stale UI evidence as the only blocker. RepoOS then refreshes it at the current HEAD once and starts one new review; if the evidence still cannot be refreshed (or the task moved on), it stays in review for a human. Set `false` to wait for a manual refresh and **Review again**. |
| `uiVerification.viewportWidths` | number[] | `[1024, 375]` | yes | Viewport widths (px) used for horizontal overflow checks during handoff verification. |

Edit all three keys in **Settings → General**. Evidence is written under `.repoos/ui-verification/<task-id>.json` and surfaced on the task drawer **Changes** tab; it records the exact captured URL, whether the declared route matched, every assertion's outcome, and the tested tree/plan identity. Each capture also carries **its own** console errors, failed same-origin requests, overflow and blank-capture issues, so the Changes tab can show a green check or red cross per shot: hover, focus or tap the icon for that shot's plain-words verdict and its own issues, while an issue tied to no single shot appears once under the list. The record shape therefore includes a per-capture `issues` array (added in #0753) alongside the handoff-wide `issues` — capture behaviour and gating are unchanged. Captured PNGs live under `work/.attachments/<task-id>/shots/` in the **main checkout** (not the task worktree), which is where a reviewer looks.

## Mechanical review verification

```toml
reviewVerification.guardTestCheck = true
reviewVerification.testGlobs = ["**/*.test.ts", "**/*.test.tsx", "**/*.test.js", "**/*.test.mjs"]
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `reviewVerification.guardTestCheck` | boolean | `true` | yes | Kill switch for the guard negative-test check. When a check *guard* a project declares in `[[check.steps]]` changed, a test must prove bad input is rejected. The check only ever fires for guards a project actually declares, so it never blocks a repo whose plan has no built-in RepoOS guard; set `false` to silence it entirely. |
| `reviewVerification.testGlobs` | string[] | `["**/*.test.ts", "**/*.test.tsx", "**/*.test.js", "**/*.test.mjs"]` | yes | Globs identifying the test files counted as negative-test evidence. Set these for a Swift, Python, Go or other non-JS project (e.g. `["**/*Tests.swift"]`, `["**/test_*.py"]`, `["**/*_test.go"]`). |

Edit both keys in **Settings → General**. The check appends a `## Automated verification` section to the review report and clamps a reviewer's `` `good to go` `` to `needs some work` on failure; the reason is recorded in the task activity note and the follow-up message to the engineer. See [Review and close-out → Automated verification](/review-and-close-out#automated-verification-when-repoos-clamps-a-clean-verdict) and [docs/review-verification.md](../docs/review-verification.md).

A **command capture target** (`[[shot.targets]]`, below) has no browser page or console, so its evidence in the same file is a `commandCaptures` record instead: the target, command, cwd, exit status, stdout/stderr tail and the images it produced (with sizes), plus the same tested-tree identity and plan fingerprint. The handoff gate writes it for command-only tasks exactly as it writes the browser record for web ones, stale-capture detection applies the same way, and the reviewer prompt says browser verification does not apply (the console-error check is `skipped`, never blocking). See [Command capture targets](#command-capture-targets-non-web-apps).

## Approval policy (opt-in auto Move to done)

```toml
approval.enabled = false
approval.autoApprove.areas = ["api", "data", "docs", "chore"]
approval.autoApprove.types = ["chore"]
approval.autoApprove.uiAreas = ["web", "ui-app", "frontend", "mobile"]
approval.autoApprove.machineryPaths = ["src/server/", "src/core/", ".githooks/", "repoos.toml", "AGENTS.md"]
approval.autoApprove.allowP0 = false
automation.paused = false
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `approval.enabled` | boolean | `false` | yes | Master switch. When true, tasks in `review` that match configured areas or types, passed the handoff gate, received a clean reviewer verdict (`good to go`), have no blocking bugs in the report, are not tagged `human-only`, and pass branch/handoff checks can **Move to done** without a human click. Each auto-approval is recorded in the task activity log (`auto-approved by policy: …`) and in the notification bell. |
| `approval.autoApprove.areas` | string[] | `[]` | yes | Task `area` values eligible for auto-approval (any match). Empty means match by type only. |
| `approval.autoApprove.types` | string[] | `[]` | yes | Task `type` values eligible (any match). Empty means match by area only. |
| `approval.autoApprove.uiAreas` | string[] | built-in UI list | yes | Areas treated as UI work. Tasks touching these areas are never auto-approved unless handoff screenshots succeeded (at least one capture, no `shots: failed` activity note). When unset, defaults to `web`, `ui`, `ui-app`, `frontend`, and `mobile`. |
| `approval.autoApprove.machineryPaths` | string[] | built-in machinery list | yes | Repo-relative path prefixes that always keep a task on the human path, whatever its area or type. When unset, defaults to `src/server/`, `src/core/`, `src/cli/`, `src/commands/`, `.githooks/`, `repoos.toml`, `AGENTS.md`, and `docs/adr/`. A prefix ending in `/` matches the directory tree; a bare file name matches that file exactly. If RepoOS cannot read the branch's changed paths it fails closed (keeps the task human). |
| `approval.autoApprove.allowP0` | boolean | `false` | yes | When false (the default), a `p0` task always waits for a human, no matter which area or type rule it matches. Set true only to let p0 work auto-approve. |
| `automation.paused` | boolean | `false` | yes | Master kill switch for **all** automatic actions — policy auto-approval, CTO safe actions, and the idle-engineer nudge. Your configured policy and allowlist are kept, so turning it back off resumes them. A human's explicit action (a UI button or API call) still runs. |

Edit these in **Settings → General**. Tag any task **`human-only`** to keep it on
a human approval path regardless of policy. UI verification and console-error
gates (#0680) may tighten the UI evidence rule later; until then, screenshot
success is the guard.

The conditions an auto-approval must pass, in order: not `human-only`; in
`review`; not `needs-input`; not a `p0` (unless `allowP0`); matches an area or
type; a clean `good to go` verdict with no blocking bugs; no lingering
`last_check_failure`; no changed path under the machinery list; the branch exists
and merges cleanly; the worktree matches its handoff snapshot (lock SHA equals
HEAD); main is clean; and for UI areas, successful handoff screenshots. Any
failure keeps the task for a human.

## Worktrees and runtime

```toml
[worktrees]
inheritEnv = false
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `worktrees.inheritEnv` | boolean | `false` | yes | When true, RepoOS symlinks the main checkout's `.env` into each task worktree so worktree-local build or preview commands can read project secrets. |
| `worktrees.candidate` | string | *(see `closeOut.candidate`)* | yes | Same as `closeOut.candidate` when the close-out section does not set it. |
| `worktrees.installCommand` | string | *(empty)* | yes | Same as `closeOut.installCommand` when the close-out section does not set it. |

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
| `localChecks.maxConcurrent` | select (1–8) | `2` | yes | Cross-process cap on local `repoos check` runs on this machine; extras queue with a visible position (#0836). |
| `localChecks.queueTimeoutMs` | number | `2700000` (45 min) | yes | How long a queued local check may wait for a slot before failing with an actionable timeout (minimum 60000). |
| `playwright.maxConcurrent` | select (1–4) | `1` | yes | Shared cap on headless Playwright work (smoke, contrast audit, shots, UI verification). |
| `playwright.queueTimeoutMs` | number | `2700000` (45 min) | yes | How long queued Playwright work may wait for the shared browser slot before timing out (minimum 60000). |
| `pressureGuard.enabled` | boolean | `true` | yes | When on, delay new local checks and engineer starts while load or memory pressure is high. |
| `pressureGuard.maxLoadPerCpu` | number | `4` | yes | Block starts when the 1-minute load average per CPU exceeds this value. |
| `pressureGuard.minAvailableMemRatio` | number | `0.08` | yes | Block starts when reclaimable memory falls below this fraction of total RAM. |
| `remoteValidation.offloadBrowserSteps` | boolean | `false` | yes | Opt-in: run browser gate steps on a runner when feasible; otherwise local under the Playwright cap. |
| `remoteValidation.localFallback` | select | `serialize` | yes | When remote validation falls back locally: `serialize` (one suite at a time), `allow` (use `localChecks.maxConcurrent`), or `off` (refuse fallback). |
| `ctoSkipHealthy` | boolean | `true` | yes | When true (the default), the CTO monitor skips its model call while the board is healthy — no stuck tasks, a fresh build and a normal process check — and only calls the model when something needs attention. Set `false` to run a full CTO pass whenever the material signal changes. |
| `cto.actions` | string[] | `[]` | yes | Opt-in allowlist of bounded recovery actions the CTO may run automatically (rate limited, audited in the bell). Values: `restart-stalled-agent` (dead active engineer), `refresh-main-install` (lockfile install in main), `requeue-closeout-after-env-fix` (refresh main then re-queue a failed env close-out). Empty means report-only. Humans can also invoke `POST /api/cto/actions/<id>`. Every automatic action is recorded in the task activity log and the notification bell, and all of them stop at once when `automation.paused = true`. |

**Restart strategy for a dead engineer.** `restart-stalled-agent` picks one of two
shapes from how the previous session ended: a network stall, timeout, or
interrupted turn **resumes** the same conversation; a real crash, an exit with no
handoff, or a task the CTO has already restarted twice this episode starts a
**fresh** conversation in the same worktree. The choice is written into the
task's activity log (`CTO action: restart-stalled-agent (resume|fresh) · …`). The
action is rate limited per task (6/hour by default) and never fires while the
agent is running, the task is paused, or its worktree has recent activity.
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

## Areas

```toml
[[areas]]
name = "web"
description = "The main web app"

[[areas]]
name = "cli"
```

```toml
areas = ["web", "core"]
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `areas.name` | string | none | yes | One declared area name (`[[areas]] name = "…"`). Required on a row; unusable rows are dropped. |
| `areas.description` | string | none | yes | Optional one-liner shown in the area picker and given to the PM agent. |
| `areas` | array of strings | `[]` | yes | Flat shorthand for declaring names without descriptions. |

A task's `area` is the part of the product its work lands in (`web`, `server`,
`core`, …), and a task can carry **several** — `area: [web, core]` in
frontmatter, shown as one chip per area in the UI and `web, core` in plain
text. Legacy `server + ui-app` values keep parsing (the `+` spelling is
accepted forever), and any file still carrying it is rewritten to the comma
form by the one-time migration at server boot.

The **effective vocabulary** the task drawer's area multi-select — and the PM
agent's task-authoring prompt — offers is the `[[areas]]` names merged with
every `[[preview.targets]].areas` value, so a repo that has only configured
previews already gets sensible options. The **first** entry is what a New task
starts on; with no vocabulary at all the field starts empty and is free text.
Editing either source updates the picker live; **Settings → General → "Areas"**
edits the declared list (descriptions are TOML-only extras). When a source
shrinks — through Settings, the raw `repoos.toml` editor, or a direct file
edit followed by a reload — tasks whose areas no longer sit in the vocabulary
get an advisory log warning, never an error, because new areas typed in the
picker always stay allowed. Save an area first used as free text ("add 'x' to
repoos areas") in the picker to adopt it into the declared list.

With no `[[areas]]` rows and no preview targets, the area field is free text
only — the picker degrades to its type-an-entry mode, not a blocking select.

## Previews and checks

```toml
[preview]
command = "bun run dev --port {port}"
readyPath = "/"
readyTimeoutMs = 10000

[[preview.targets]]
name = "Landing page"
areas = ["landing", "web"]
paths = ["landing/**"]
command = "bun run dev --port {port}"
cwd = "landing"

[[preview.services]]
name = "API"
command = "bun run api --port {port}"

[[preview.targets]]
name = "Full stack"
areas = ["web"]
services = ["API"]
command = "bun run web --port {port} --api {api.port}"
```

`[preview]` configures the read-only preview RepoOS starts from a task worktree
when a task is in `active` or `review`.

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `preview.command` | string | unset | yes | Default preview command, used when no target matches the task's `area`. |
| `preview.cwd` | string | worktree root | yes | Subdirectory of the worktree to run the default command in. |
| `preview.readyPath` | string | `/` | yes | Path polled for readiness, relative to the preview URL. A missing leading slash is added. |
| `preview.readyTimeoutMs` | number | `10000` | yes | How long to wait for the default command to answer before giving up. Raise it for a command that also builds first. |
| `preview.paths` | array of strings | `[]` | yes | Repo-relative globs (see below) declaring which files the default (main-app) preview serves for shot resolution (#0594). Test artifacts are never counted as UI evidence (#0603). |
| `preview.targets[].name` | string | derived from `areas` | yes | Human label for diagnostics and the preview picker. |
| `preview.targets[].areas` | array of strings | `[]` | yes | Task `area:` values this target serves, matched case-insensitively. |
| `preview.targets[].paths` | array of strings | `[]` | yes | Repo-relative globs (see below). A changed file matching any glob selects this target for `repoos shot`, independent of the task's `area`. Test artifacts are never counted as UI evidence (#0603). |
| `preview.targets[].command` | string | required | yes | Command that boots the target. Rows without one are dropped. |
| `preview.targets[].cwd` | string | worktree root | yes | Subdirectory of the worktree to run the command in. |
| `preview.targets[].readyPath` | string | `/` | yes | Per-target readiness path (`ready_path` is also accepted). |
| `preview.targets[].readyTimeoutMs` | number | `10000` | yes | Per-target readiness timeout (`ready_timeout_ms` is also accepted). |
| `preview.targets[].services` | array of strings | `[]` | yes | Names of `[[preview.services]]` to boot before this target's main command (#0681). |
| `preview.services[].name` | string | required | yes | Label used to reference the service from a target and in diagnostics. |
| `preview.services[].command` | string | required | yes | Command that boots the service on its own OS-assigned port. Rows without one are dropped. |
| `preview.services[].cwd` | string | worktree root | yes | Subdirectory of the worktree to run the service in. |
| `preview.services[].readyPath` | string | `/` | yes | Readiness path on the service's own URL (`ready_path` is also accepted). |
| `preview.services[].readyTimeoutMs` | number | `20000` | yes | Per-service readiness timeout (`ready_timeout_ms` is also accepted). |

`{port}` and `{host}` are replaced at runtime, and the command's environment
also receives `PORT` and `HOST`. Each companion service also exposes
`{<name>.port}` / `{<name>.url}` (name lowercased, non-alphanumerics to `_`) and
`REPOOS_PREVIEW_<NAME>_PORT` / `REPOOS_PREVIEW_<NAME>_URL` to every command in
the preview. Services become ready before the main command starts, so a web
target can proxy `/api` to the branch's own API instead of the primary checkout.
RepoOS owns every port and lifecycle; never hardcode a port in a preview
command. A task with no usable preview configuration gets an actionable "no
preview configured" message rather than booting a random app. Previews are
one-at-a-time and a new request evicts the previous preview. The control-plane
server re-reads `repoos.toml` when it changes on disk (including after a merge
to the primary branch), so new targets appear without restarting `repoos serve`.

`preview.targets[].paths` drives `repoos shot`, which picks the target to
screenshot from the task's changed files rather than its up-front `area:`.
`preview.paths` does the same for the default target — without it the main
app was reachable only through area resolution, and a mixed diff touching the
app plus (say) one docs file screenshotted just the docs. A glob uses `*`
within one path segment, `**` across segments (including none), and `?` for
one non-slash character — `landing/**` matches every changed file under
`landing/`. When no target's globs match, `repoos shot` falls back to the
area match (then the default command); `--target` overrides either way.

The dev-target counterpart of these services is `[[dev.services]]` (#0843):
the same companion-service model — boot before the target, its own port,
`{<name>.port}`/`{<name>.url}` substitution — for the things you start
yourself from the Dev page rather than for task previews. See
[Dev target services](#dev-target-services) below.

> **`[[preview.targets]]` and `[[preview.services]]` are deliberately TOML-only.**
> The Settings UI is built on a flat `key = value` schema, which cannot express a
> per-row sub-field of an array of tables; there is no control for target or
> service rows today. Editing `repoos.toml` is the supported path, and
> `repoos shot`'s area/target mismatch warning is what makes a stale `area:`
> visible. This is the documented exception to the "every feature setting needs
> a Settings control" rule, not an oversight.

### Command capture targets (non-web apps)

A repo whose product is a native macOS app, a mobile app or a desktop app has no
dev server to point at — so a `[[preview.targets]]` dev server plus a headless
browser cannot produce evidence shots. Declare `[[shot.targets]]` instead: each
row is a **command that renders image files offscreen**, which RepoOS collects as
the task's shots with the same captions, stale-tree detection, Changes-tab
display and gitignore rules as web shots (#0761).

```toml
[[shot.targets]]
name = "macOS app"
areas = ["mac"]
paths = ["Sources/Divot/**", "Tests/DivotTests/**"]
command = "swift test --filter RenderShots"
outputGlob = ["*.png"]
requires = "xcrun"
timeoutMs = 120000

[[shot.targets]]
name = "iOS app"
areas = ["ios"]
paths = ["ios/**"]
command = "xcrun simctl io booted screenshot \"$REPOOS_SHOT_DIR/home.png\""
requires = "xcrun"
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `shot.targets[].name` | string | derived from `areas` | yes | Target name, matched by declared `## Shots` entries and `--target`. |
| `shot.targets[].areas` | array of strings | `[]` | yes | Task `area:` values this target serves, matched case-insensitively. |
| `shot.targets[].paths` | array of strings | `[]` | yes | Repo-relative globs. A changed file matching any glob selects this target for the automatic handoff capture and `repoos shot`. Test artifacts are never counted (#0603). |
| `shot.targets[].command` | string | required | yes | Shell command that renders the images. Rows without one are dropped. |
| `shot.targets[].cwd` | string | worktree root | yes | Subdirectory of the worktree to run the command in. |
| `shot.targets[].outputGlob` | array of strings | `["*"]` | yes | Globs selecting the produced images, relative to `REPOOS_SHOT_DIR` (`output_glob` is also accepted). `**` spans directories. |
| `shot.targets[].requires` | string | unset | yes | A binary that must exist on `PATH`. A missing binary records a visible `shots: skipped` note — never a failed handoff. |
| `shot.targets[].timeoutMs` | number | `120000` | yes | Capture timeout. On expiry the command is killed and the tail of its stdout/stderr is recorded as a visible note (`timeout_ms` is also accepted). |
| `shot.maxAutoShots` | number | `12` | yes | Cap on how many images an **automatic (undeclared)** command capture attaches per task. A command's `outputGlob` can match dozens of files; past this many the extra ones are dropped and the task notes `N more not shown`. Declared `## Shots` entries are never capped. |

The command runs in the task's worktree. RepoOS creates a fresh, **gitignored**
directory and passes its absolute path to the command as `REPOOS_SHOT_DIR`
(and the worktree root as `REPOOS_WORKTREE`); every image the command writes
there and matching `outputGlob` is collected. RepoOS **never** passes a tracked
path, so a command that ignores the variable writes nothing RepoOS collects. A
command problem never fails a handoff: stdout/stderr is recorded as a
`shots: failed — <tail>` / `shots: skipped — <reason>` activity note and the
handoff proceeds. A command that exits non-zero but still wrote images has them
collected anyway, with a visible warning naming the exit code — so a partial
failure still produces shots and is always recorded, never silently.

At handoff RepoOS also writes the capture's provenance to
`.repoos/ui-verification/<task-id>.json` (the same evidence file web captures
use): the target, command, cwd, exit status, stdout/stderr tail, each image's
size, and the tested tree identity. A reviewer reads that record and the PNGs
instead of a browser console — a command-target task is never blocked on a
console log it cannot produce.

**Capturing only what changed (#0769).** A command target's `outputGlob` often
matches a whole fixed snapshot set (the bar plus every popover), so an automatic
capture attaches dozens of images and the one that shows the change may not be
among them. A `## Shots` entry can hand the selection to the command instead:

- `env` — an object of extra environment variables for the command, e.g.
  `{"DIVOT_SNAPSHOT_ONLY": "worldclock"}`. Keys must be plain identifiers; a
  value is passed through the environment **only** and is never interpolated
  into the command string, so a declared value cannot be shell-evaluated.
- `args` — extra tokens appended to the command line, each shell-quoted as data.
- `glob` — a glob narrowing which produced files become **this** shot, relative
  to `REPOOS_SHOT_DIR`, e.g. `"*worldclock*.png"`.

Several entries may name the same target, each with its own `env`/`glob` and its
own `label`; each runs the command and its results are listed under that label.
Identical entries collapse as before. `env`/`args`/`glob` are rejected for a web
preview target (they only make sense for a command) — the CLI and the write
paths report that as an error rather than silently dropping them.

```json
[
  { "target": "macOS app", "label": "World clock popover",
    "env": { "DIVOT_SNAPSHOT_ONLY": "worldclock" }, "glob": "*worldclock*.png" },
  { "target": "macOS app", "label": "Battery popover",
    "env": { "DIVOT_SNAPSHOT_ONLY": "battery" }, "glob": "*battery*.png" }
]
```

With the project's command honoring the filter variable — e.g.
`command = "swift test --filter RenderShots"` where the test reads
`DIVOT_SNAPSHOT_ONLY` and renders only that view — each entry captures just its
one image. The same selection is available ad hoc from the CLI:
`repoos shot --target "macOS app" --env DIVOT_SNAPSHOT_ONLY=worldclock --glob '*worldclock*.png'`.

Web preview targets keep working unchanged, and a repo may declare both: a diff
that touches a web target's paths is shot from the browser, and a diff that
touches a command target's paths runs that command. Declare a shot for a
non-web target in the task's `## Shots` section exactly like a web one
(`{"target": "macOS app", "label": "Menu bar open"}` — no `route`); page-only
fields (`route`, `selector`, `highlight`, `steps`) are ignored for a command
target. `repoos shot --target "macOS app"` works from the CLI too.

A short recipe for the common platforms, and how declarations and skip messages
behave, are in [Previews and shots](../docs/previews.md#evidence-shots-for-non-web-targets).

> **`[[shot.targets]]` is deliberately TOML-only**, for the same reason as
> `[[preview.targets]]`: an array of tables cannot be expressed by the flat
> Settings schema. The Settings UI lists the `shot.targets` key so search points
> you at this section, but editing `repoos.toml` is the supported path.

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
| `check.isolationRuns` | number | `3` | yes | After a failed tests step names a few test files, re-run each alone this many times and record `passed N/N alone` / `failed N/N alone` on the run. Informational only — it never turns a failed run green. `0` disables it. Interactive/CLI and pre-review runs only; close-out and release never use it. |
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
| `check.hardcodedColorDirs` | array of strings | unset | yes | Source roots the `hardcoded-colors` guard scans for `#hex` / `rgba(255,…)` literals in component `<style>` blocks. Stylesheets are deliberately out of scope — their literals are theme tokens, checked by `theme-contrast`. |
| `check.contrastExempts` | array of tables | unset | yes | Selectors the rendered-contrast audit allows below the WCAG floor, each with a reason. Rows missing either half are dropped. |
| `check.fullSuitePaths` | array of strings | unset | yes | Repo-relative path prefixes that force the **full** close-out suite even when `closeOut.gate` would reuse or scope it (#0724) — machinery the changed-path scoping cannot reason about, e.g. a CI pipeline or the check engine's own config. |
| `check.contrastExempts.selector` | string | required | yes | CSS selector to exempt (matched against the text's element and its ancestors), e.g. `.code-pane`. |
| `check.contrastExempts.reason` | string | required | yes | Why the block is intentionally off-contrast — this is what makes the exemption reviewable. |

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
enabled = true
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `stories.enabled` | boolean | `true` | yes | Shows the Stories page, its navigation item (between Work and Checks), and the task drawer's Story field. On by default; set `false` to hide all three. |
| `stories.excerptBytes` | number | `4096` | yes | How many bytes of a story's definition the engineer and reviewer prompts include as shared background (see *What agents see*). Clamped to 512–65536. |

Story definition files live under `storiesDir` (default `stories`, a top-level
repo-relative layout key — see *Layout and repository paths*). Existing repos
need no migration; moving the directory means moving the files and setting the
key together, with a server restart.

With stories enabled, the task drawer shows **Story** next to **Area** on the top
row of the details form instead of **Assigned to**; assignee stays in task
frontmatter and remains writable from the CLI (`repoos update <id> --assigned-to`).

Stories are an optional grouping over tasks: a delivery slice that spans several
technical areas and owners. You can **register a story up front** with a markdown
file under `stories/` (from the Stories page **New story** flow, or by adding a
file in git), and/or tag tasks with a matching `story:` value in frontmatter —
from the **Story** field in the task drawer or in the New task panel, or with
`repoos new "…" --story "Project updates email"` / `repoos update <id> --story
"Project updates email"`. Task tags drive counts, progress, and completion;
definition files add name and description before any task exists. A story has no
worktree, agent, branch, or status of its own. The Stories page merges registered
definitions with tagged tasks.

**New task** in a story panel's **Tasks** tab opens the normal New task panel
with that story already selected — and shown, so you can change or clear it —
and lands you back on the story once the task exists. The button is there even
when the story has no tasks yet.

**New story** saves and commits the story file as soon as you submit, so you
can leave the pane and `stories/` never leaves `main` with uncommitted changes.
The PM agent then works in the background: it names the story (unless you gave
it a name), writes up the scope, and tags any existing untagged tasks that
belong to it. The story shows **PM is working** on the Stories page until the
agent finishes. If the agent fails, the story stays as you wrote it and the
reason appears in a notification.

#### Verbatim stories (no PM)

An agent or script that already has the finished story does not want the PM to
rewrite it or retag tasks. Use the CLI or the API instead of the UI flow:

```bash
repoos story new "Project updates email" --body "Scope, outcomes, non-goals."
repoos story update 0007 --body "Rewritten scope."   # keeps the stable number
```

`POST /api/stories { name?, body }` and `PATCH /api/stories/:key { name?, body? }`
do the same over HTTP, and `POST /api/stories/freeform { …, pm: false }` is the
freeform route with the flesh-out — and the task tagging — switched off. All of
these write and commit the definition exactly as given, keep the story's number
across a rename, and start no agent. The UI's **New story** keeps the PM
flesh-out by default. See [`repoos story`](/cli#repoos-story-newlistshowupdate).

A story counts as complete only when every one of its tasks is done, and there
is no manual completion control.

Story names are whitespace-normalized and matched case-insensitively, so
`Project updates email` and `project  updates  email` group together under one
stable display name. Clearing the field removes the task from every story.

### What agents see

When a tagged task with a registered story is picked up, the engineer and the
reviewer both get a **Story context** block in their prompt: the story's number
and title, the path to its definition file, the ids, titles and statuses of the
other tasks in the story, and the first `stories.excerptBytes` bytes of the
definition. The story file is named so the agent can read the rest itself.

This means the shared background you write into a story — why the work exists,
decisions already made, evidence — reaches the agent doing the work, not only
the humans reading the board. The excerpt is bounded so a long field report does
not ship into every turn; raise `stories.excerptBytes` if your stories carry
more reference material than the default.

The block is omitted when a task carries no `story` tag, or when its tag names a
story with no definition file (a tag-only story has nothing to excerpt). The task
drawer's transcript records a line saying the story context was included and the
excerpt size, so a review can see what the agent was given.

### Numbers and links

Every registered story gets a **number** — a zero-padded four-digit value like
`#0007`, the story counterpart to a task's `#0042` and an input's `#0001`. It
appears in the same place on both the Stories page and the story panel, and
clicking it copies a link straight to that story, the same as clicking a task's
or input's number.

The number is stable for the life of the story: it is assigned once, is never
changed, and survives the PM agent renaming the story and its file, so links
keep working through a rename — which a name-based link would not. Deleting the
highest-numbered story does free that number for the next one created.

`/stories?story=0007` opens that story's panel. The story's name also works, as
does `?story=new` to open the New story form.

A story that exists **only** as a task tag — tagged on a task, with no file
under `stories/` — has no number and no link. There is no file to hold a stable
one, so there is nothing to point a link at. Register the story to get both.
Registering one later gives it a number, which also starts a fresh PM
conversation for it.

### The story PM tab

A story panel has a **PM** tab, right after the story body, exactly like a task
panel's. Ask the PM to break the story down into tasks, retag or update one, or
explain what is blocking it. It reads and writes the same tasks the story
already holds, and the conversation is per story and per user.

The PM tab is the agent's working surface for a story, not a read-only view: it
uses the same `repoos` CLI commands the task panel's PM tab does, so the PM can
create and update tasks tagged with this story. It is the same conversation
component, so the two panels behave identically.

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

## Attachment storage

```toml
[storage]
provider = "local"
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `storage.provider` | `local` \| `neon` | `local` | yes | Where attachment files (task and input screenshots) are stored. `local` keeps them in gitignored `.attachments/` folders on this machine. `neon` (Neon Object Storage) is opt-in and needs credentials before it can be used; until it is configured, Settings shows it as unavailable with an explanation and RepoOS falls back to `local`. Changing it requires a server restart. |

The Settings page exposes this key as "Attachment storage".

### Neon Object Storage credentials

The `[storage]` section only chooses the provider; it never carries a secret.
The Neon credential is supplied through the environment, exactly like the auth
and model-provider keys, so no access key ever reaches `repoos.toml` or git.
Set these in `.env` (gitignored) or a machine secret store:

| Variable | Purpose |
| --- | --- |
| `REPOOS_NEON_STORAGE_ENDPOINT` | The branch's S3 endpoint URL, e.g. `https://br-….storage-c-2.us-east-2.aws.neon.tech`. |
| `REPOOS_NEON_STORAGE_REGION` | The branch's S3 region, e.g. `us-east-2`. |
| `REPOOS_NEON_STORAGE_BUCKET` | The bucket objects are stored in. |
| `REPOOS_NEON_STORAGE_ACCESS_KEY_ID` | The storage credential's S3 access key id (`token_id`). |
| `REPOOS_NEON_STORAGE_SECRET_ACCESS_KEY` | The storage credential's S3 secret access key. |
| `REPOOS_NEON_STORAGE_PREFIX` | Optional key prefix isolating this instance's objects. |

The endpoint, region and bucket come from the branch's storage state in the Neon
Console or `GET /projects/{project}/branches/{branch}/storage`; the access key
and secret come from a storage-scoped credential
(`neon credentials create --scope storage:read --scope storage:write`). Full
verified details, limits and pricing: [`docs/neon-object-storage.md`](https://github.com/repoos/repoos/blob/main/docs/neon-object-storage.md).
Until every required variable is set, `neon` reports itself unavailable and
attachments continue to use local storage.

When `neon` is configured and in effect, attachment bytes are still written to
the local gitignored `.attachments/` tree first. If Neon is unreachable, reads
serve the local original (when it exists), embedded task references keep
working, and the UI labels the attachment **upload pending** until a verified
cloud copy exists — never as available on faith. Local originals are not deleted
by outage or provider-mode changes; lifecycle rules apply only after verified
upload (see the cloud attachment storage story).

**Retrieval:** viewing or downloading an attachment always requires the
RepoOS server that owns the repository (or the local file on disk). Cloud
storage is durability for those bytes, not remote access from another machine
without that server.

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

## Telegram

```toml
[telegram]
enabled = false
provisioningUrl = ""
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `telegram.enabled` | boolean | `false` | yes | Master switch for the Telegram integration (connection surfaces, notifications, commands). While off, connection-management API calls are refused and any armed polling loop pauses its Telegram traffic — no Telegram surface is active. The bot itself is connected from the Settings connection panel by an administrator — a project bot token pasted server-side (Bring Your Own Bot Token) or, once deployed, managed provisioning. The token is stored encrypted on this machine; it never appears in this file or in any browser response. See [Telegram](/telegram). |
| `telegram.provisioningUrl` | string | `""` | yes | Base URL of the official managed-provisioning service (#0559). Empty means managed provisioning is "not configured" and is reported as such; Bring Your Own Bot Token works without it. This key is deliberately TOML-only (no Settings control) — see the exception note below. |

**Deliberate exception:** `telegram.provisioningUrl` is advanced/internal
configuration and gets no Settings control. A URL for a service that a repo
operator will deploy separately (#0559) sits next to a
`REPOOS_TELEGRAM_PROVISIONING_KEY` environment key, not a toggle, and a
misconfigured URL would make a half-configured hosted dependency look like a
settled feature. BYO needs nothing here.

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
| `remoteValidation.tailscaleHost` | string | unset | yes | Tailscale hostname or 100.x.x.x IP of the runner machine — single-host shorthand for the pool (Tailscale provider only). |
| `remoteValidation.tailscaleHosts` | array | unset | yes | Tailnet host pool (#0521): jobs dispatch to a host with the fewest active runs, queue only when every eligible host is at its per-host limit, and use this list's top-to-bottom order to break ties. Edit as a comma-separated host list in Settings → Remote validation or reorder plain-list hosts in Checks → Remote runners; saves update the live dispatcher without restarting. Rich `[[remoteValidation.tailscaleHosts]]` rows (`host`, plus optional `user`, `os`, `labels`, `maxConcurrent`) remain editable in `repoos.toml` and are read-only in the Remote runners tab. |
| `remoteValidation.tailscaleUser` | string | `root` | yes | SSH user on the tailscale host (Tailscale provider only). |
| `remoteValidation.containerImage` | string | `repoos-ci` | yes | Docker image to run the gate in (Tailscale provider only). |
| `remoteValidation.serverType` | string | `cax31` | yes | Hetzner server type. Must match the architecture the snapshot was built on. |
| `remoteValidation.location` | string | `hil` | yes | Hetzner location slug. |
| `remoteValidation.snapshotId` | string | unset | yes | ID or name of the prebuilt Hetzner snapshot the runner boots from. |
| `remoteValidation.sshKeyName` | string | unset | yes | Name of the SSH key registered in the Hetzner project. |
| `remoteValidation.idleShutdownMinutes` | number | `8` | yes | How long a warm server stays alive after a job so queued jobs reuse it. |
| `remoteValidation.maxServerLifetimeMinutes` | number | `120` | yes | Hard cost stop-loss: any runner older than this is force-deleted. Minimum `10`. |
| `remoteValidation.maxConcurrent` | select (1–8) | `1` | yes | How many remote validation runs may execute at once **per host**; extra runs wait in a FIFO queue. Two full test suites on one machine cause load-induced timeouts that show up as a failed gate. Covers handoff, close-out and release in the server; a host-side lock extends the same limit to standalone `repoos check` runs. |
| `remoteValidation.hangIdleMinutes` | number | `5` | yes | Minutes a remote run's output may sit unchanged while its host is idle (load per CPU below 0.5) before the run is treated as hung: its container is killed and the run retried once on another host. Raise only for suites that legitimately go quiet longer than that; too high and a real hang wastes the host. |
| `remoteValidation.fallbackToLocal` | boolean | `false` | yes | When the runner is unreachable, run the full gate locally instead of keeping the task in review for retry. |
| `remoteValidation.useForReleases` | boolean | `false` | yes | Also validate release cuts on the runner. Off by default because a release is watched live. |
| `remoteValidation.retryOtherHosts` | boolean | `true` when 2+ hosts configured, else `false` | yes | When a transient failure (timeout, ssh drop, host overload) occurs on one host with the `tailscale` provider, retry the run on another healthy, free host before applying `fallbackToLocal`. A non-transient result (red gate, config error) never retries. Default `true` when at least two hosts are configured (`tailscaleHost` + `tailscaleHosts` or two `tailscaleHosts` entries); `false` otherwise. Only applies to the `tailscale` provider. |
| `remoteValidation.engineerSelfCheckRemote` | boolean | `true` when remote validation is enabled | yes | Managed engineers run install + build + tests on the runner during `repoos check` (format/lint stay local). Handoff reuses a green remote pass at the same commit. Turn off to run the full gate on the laptop again. |

The `HETZNER_API_TOKEN` and `REPOOS_REMOTE_SSH_KEY` credentials are
environment-only.

### Tailscale host pool

With the `tailscale` provider you can configure a pool of machines. Jobs
dispatch to the host with the fewest active runs; they queue only when every
eligible host is busy. Equal-load hosts are tried in configured order (top to
bottom), so the first host gets work when all are idle. Use the up/down controls
in Checks → Remote runners to reorder a plain string pool; the change applies
immediately to new runs and does not affect in-flight runs. That page also
shows per-host load averages, CPU count, memory use/total, free disk in the
remote work area, and when each read-only SSH sample was taken. Samples run
while the tab is open, at most every 15 seconds, and time out after five
seconds; a failed or unreachable host reports unavailable stats.
There are two authoring forms — pick **one** per config:

**Plain list** (also editable in Settings → Remote validation → "Host pool").
Saving in Settings updates the running dispatcher immediately without a
restart. Each entry is a hostname or a `user@host` string:

```toml
[remoteValidation]
provider = "tailscale"
tailscaleHosts = ["nick@bee", "nick@thinkpad", "peckjachowski@mini"]
```

Without a `user@` prefix the global `tailscaleUser` (default `"root"`) is used:

```toml
[remoteValidation]
provider = "tailscale"
tailscaleHosts = ["bee", "thinkpad", "mini"]
tailscaleUser = "nick"     # default SSH user for all hosts
```

The single-host `tailscaleHost` shorthand is included in the pool. When
`tailscaleHosts` is empty, it pins that host to the top; remove the shorthand
from `[remoteValidation]` to control its position using the pool order. When
`tailscaleHosts` is non-empty, the explicit list's order takes precedence and
the shorthand does not jump ahead of it.

**Rich rows** — one `[[remoteValidation.tailscaleHosts]]` block per host when
you need per-host settings (`user`, `os`, `labels`, `maxConcurrent`,
`runner`). Use this form when hosts differ (different SSH users, macOS vs
Linux, etc.):

```toml
[remoteValidation]
provider = "tailscale"
tailscaleUser = "nick"     # fallback user for hosts without an explicit one

[[remoteValidation.tailscaleHosts]]
host = "mini"
# user = "nick"            # inherits tailscaleUser

[[remoteValidation.tailscaleHosts]]
host = "bee"
os = "linux"
maxConcurrent = 2          # this host can run two suites at once

[[remoteValidation.tailscaleHosts]]
host = "thinkpad"
os = "linux"
```

Per-host fields: `host` (required), `user`, `os` (capability label, e.g.
`"macos"` or `"linux"`), `labels` (extra capabilities, e.g.
`["apple-silicon"]`), `maxConcurrent` (per-host FIFO limit, default 1),
`runner` (`"docker"` (default) or `"native"` — macOS-only).

The per-host attrs (`user`, `os`, `labels`, `maxConcurrent`, `runner`) are
TOML-only; the Settings UI only edits the plain host-name list.

The existing single-host shorthand `tailscaleHost = "mini"` still works and
is folded into the pool as a plain entry. See
[docs/remote-validation.md](../docs/remote-validation.md) for full
dispatch, routing and cross-process-limit details.

## Dev targets

Dev targets are the things you run yourself while developing — a local HMR web
server, a debug build — as opposed to task previews, which RepoOS manages for a
task's worktree. Declare them in `repoos.toml` with a repeatable
`[[dev.targets]]` table, one row per target:

```toml
[[dev.targets]]
name = "web"
kind = "server"
command = "bun run dev"
url = "http://localhost:5173"
label = "Web app"
healthCheck = { url = "http://localhost:5173/health" }

[[dev.targets]]
name = "apk"
kind = "artifact"
command = "bun run build:android"
artifactPath = "dist/app-debug.apk"

[[dev.targets]]
name = "divot"
kind = "process"
command = "swift run --package-path macos divot"
label = "Divot bar"
```

| Key | Type | Required | Description |
| --- | --- | --- | --- |
| `dev.targets[].name` | string | yes | Stable identity, unique within the project. The API and CLI address a target by this name. |
| `dev.targets[].kind` | `server` \| `artifact` \| `process` | yes | `server` is a long-lived process with a URL; `artifact` is a build that produces a file and exits; `process` is a long-lived foreground process with no URL and no build artifact (a native app, a daemon). |
| `dev.targets[].command` | string | yes | Shell command run in the project's **root checkout** (never a task worktree). May contain `{port}` (see below). |
| `dev.targets[].url` | string | for `server` | The server's URL, e.g. `http://localhost:5173`. May contain `{port}`. A `process` never has one. |
| `dev.targets[].port` | number | no | The port used for `{port}` (#0802). With auto-pick on it is the preferred port — used when free — otherwise a free one is chosen; with auto-pick off it is the fixed port. |
| `dev.targets[].autoPort` | boolean | no | Auto-pick a free port for `{port}` (#0802). Default `true`; set `false` to pin the target to `port` and let a clash fail with the summary. |
| `dev.targets[].artifactPath` | string | for `artifact` | Repo-relative path of the build output. |
| `dev.targets[].label` | string | no | Human label shown in the UI; defaults to `name`. |
| `dev.targets[].services` | array of strings | no | Names of `[[dev.services]]` rows (#0843) booted before this target, in order, each on its own port. The target's `command`, `url` and `healthCheck.url` reference one as `{name.port}` / `{name.url}`. Unknown or repeated names are validation errors. |
| `dev.targets[].healthCheck.url` | string | no | URL polled until it answers before a `server` target is reported running. Defaults to `url`; may contain `{port}` and `{name.port}`. |
| `dev.targets[].healthCheck.file` | string | no | Repo-relative file that must exist before the target is reported running. |

`{port}` in a target's `command`, `url` or `healthCheck.url` is replaced with a
port chosen when the target starts. Auto-pick is **on by default** (#0802): a
preferred `port` is used when it is free, otherwise a free, OS-assigned port is
chosen — the same handling `[[preview.targets]]` uses — so a dev server that
would otherwise clash with another app binds cleanly. The substituted port is
the same in all three fields, and the Dev page shows the real URL of a running
target. Set `autoPort = false` to pin the target to `port` instead: a port
already in use then fails with the plain-language summary (naming the process
holding it) rather than being moved. Picking a port never stops another process.
A target with no `{port}` behaves exactly as before, keeping its fixed port.

A row must have a way to be judged healthy: a `server` has a `url`, an `artifact`
has an `artifactPath`, and a `process` is healthy while its process is alive (so
it carries no `url`, `artifactPath` or `healthCheck`). A `server` with no `url`
is rejected with a pointer to `kind = "process"`.

Only commands declared here can be run: the API and `repoos dev` name a target,
and the command is always resolved from the committed `repoos.toml` — no request
body ever supplies a command. Starting a target leaves it running independent of
the browser; it stops only when you ask, when the server stops, or when it
crashes. Status is one of `running`, `stopped`, `starting` or `failed`, and the
last 2000 lines of a target's combined output are kept and shown in a scrollable
panel on the Dev page.

### Dev target services

A full-stack target — a web dev server whose backend proxies to it — does not
need either port pinned in config. Declare companion services as a repeatable
`[[dev.services]]` table next to `[[dev.targets]]` (the dev counterpart of
`[[preview.services]]`), and reference them from a target's `services` list
(#0843):

```toml
[[dev.services]]
name = "api"
command = "bun --watch src/server/index.ts"   # reads PORT
healthCheck = { url = "http://localhost:{port}/api/health" }

[[dev.targets]]
name = "app"
kind = "server"
services = ["api"]
command = "bun run dev -- --port {port} --api-port {api.port}"
url = "http://localhost:{port}"
```

On **Start**, every listed service boots BEFORE the target, each on its own
port, and is health-gated: a service whose health check (or, with none
declared, a short alive-settle) does not pass fails the start with the
service's name in the reason, and everything started so far is torn down — the
target otherwise starts fine and then proxies to a dead API. Each service's
port is substituted into the target's `command`, `url` and `healthCheck.url` as
`{<name>.port}` / `{<name>.url}` (name lowercased, non-alphanumerics collapsed
to `_`), passed as `PORT` and `REPOOS_DEV_<NAME>_PORT` / `REPOOS_DEV_<NAME>_URL`
to the service, and passed as the same `REPOOS_DEV_*` variables to the main
command. Inside a service's own `command` and `healthCheck.url`, `{port}` (and
`PORT`) is the service's own port. Services boot in the order listed, so a
service may reference a sibling declared before it. Service names referenced by
one target must map to distinct placeholder tokens: two names that normalize to
the same `{<token>.port}` (for example `api-v1` and `api_v1`) are a config
error, not silently disambiguated, so a documented token can never resolve to
the wrong service.

| Key | Type | Required | Description |
| --- | --- | --- | --- |
| `dev.services[].name` | string | yes | Label used to reference the service from a target's `services` list and in diagnostics. |
| `dev.services[].command` | string | yes | Command that boots the service. Its own `{port}`/`PORT` is the port RepoOS assigns it. |
| `dev.services[].cwd` | string | repo root | Repo-relative subdirectory to run the command in. |
| `dev.services[].port` | number | no | The service's preferred/fixed port, handled exactly like a target's `port` (#0802). |
| `dev.services[].autoPort` | boolean | no | Auto-pick a free port; default `true`. With `false` the `port` is required and fixed — an occupied one fails with a message naming the service (and `autoPort = false` with no `port` is rejected as a config error, not only at Start). |
| `dev.services[].healthCheck.url` | string | no | URL polled (with ports substituted) until it answers before the service counts as ready. |
| `dev.services[].healthCheck.file` | string | no | Repo-relative file (resolved against the service's `cwd`) that must exist AND be newer than when the service started — a stale marker left by a previous run does not count as ready (#0843 review). |
| `dev.services[].env` | table | no | Extra environment variables for the service's process, e.g. `env = { LOG_LEVEL = "debug" }`. |

Stopping or restarting the target stops its services with it, and a start
that fails at the target — its command cannot launch, or its readiness check
never passes — tears the already-booted services down too. A service that
crashes while the target runs (including after a reload handover, where the
PID-liveness check catches the death) tears down the whole stack: the target
and every sibling service are stopped, their recorded PIDs are cleared, and
the target is marked failed with the service's name in the reason. A target
crash does the same cleanup and marks the target failed. These states remain
visible on the Dev page (each service has its own sub-row there — status, real
port, PID, and its own output). Startup or health-check failure also tears down
every process that already started. Stop, restart, server shutdown, and a
reload that cannot adopt a complete live stack use the same cleanup. A healthy
stack adopted during reload keeps running and remains manageable. Every
declared service also answers on `repoos dev <name> status|logs --service <name>`.

For an `artifact` target, companion services stay available while the build
runs and are stopped automatically when it exits successfully. A failed build
or failed service also tears down the stack.

> **`[[dev.services]]` are deliberately TOML-only**, like
> `[[preview.services]]`: a service is a command + port + health check + env
> table no Settings row can express. Edit them in `repoos.toml`; a target's
> `services` name list can also be edited in the Dev targets card
> (Settings → Advanced) and round-trips through it.

When a target fails, the Dev page shows a plain-language summary above its
output — what failed, the most likely cause, and how to fix it. A port already
in use is detected from the output and names the port plus the process holding
it (its PID and command), with a **Stop** action when that process is one RepoOS
started — including a companion service, in which case the owning target and
all its services stop together; any other process is shown for you to stop
yourself. An optional
AI-written summary can be layered on top:

| Key | Type | Default | Restart | Description |
| --- | --- | --- | --- | --- |
| `dev.failureSummary.ai` | boolean | `false` | no | Offer an AI-written plain-language summary of a failed dev target, in addition to the deterministic diagnosis. Off by default because it spends a model call. |

An invalid row — a missing name or command, an unknown `kind`, a duplicate name,
or a conflicting field such as a `url` on an `artifact` — is reported as a clear
validation error rather than being silently dropped. Edit the list under
**Settings → Advanced → Dev targets** (validation errors appear inline, and the
change is written through the config API), or hand-write the `[[dev.targets]]`
tables. See [Dev targets](/dev-targets) for a full walkthrough.

## Editor integration

Applies to any install where RepoOS launches a local editor: task specs, context docs, and failed-test links.

| Key | Type | Default | Restart | Description |
| --- | --- | --- | --- | --- |
| `editor.command` | string | `""` | no | Optional editor launcher used by "Open in editor" links, e.g. `zed {file}:{line}`. Placeholders `{file}` and `{line}`; omit `{line}` to open without a line number. Always visible in Settings. Overrides precedence: `dev.inspector.editorCommand` takes precedence when set. |

## Dev copy inspector (RepoOS self-host only)

These settings appear under **Settings → Advanced** when this checkout has `src/ui-app/` **and** the running build was compiled with the dev UI bundle (`devUi: true` in `dist/.build-info.json` — a normal local `bun run build`, not `REPOOS_SHIP=1` / release tarballs). They are inert on release installs and when previewing another project's app.

| Key | Type | Default | Restart | Description |
| --- | --- | --- | --- | --- |
| `dev.inspector.enabled` | boolean | `true` | no | Hold Alt (Option on macOS) over visible UI text to reveal a `File.vue:line` pill with the located element outlined; click it or press Enter to see the source file. |
| `dev.inspector.editorCommand` | string | `""` | no | Optional editor launcher, e.g. `zed {file}:{line}`. Placeholders `{file}` and `{line}`; omit `{line}` to open without a line number. Copy path works with no command configured. |

Template copy is attributed at build time with `data-repoos-file` / `data-repoos-line`
attributes (dev builds only). Line numbers point at the template element; strings
composed in `<script setup>` lead you to the template line that renders them.

See [Dev tooling](/dev-tooling) for how to verify the inspector locally.

## Summary

Commit project behavior in `repoos.toml`, keep secrets in a gitignored `.env` or
the machine environment, and treat a `REPOOS_`-prefixed variable as an override
only when it is documented as a supported one. For the complete secret contract,
read [Environment and secrets](/environment-and-secrets).
