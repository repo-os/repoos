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
`[tunnel]`, and anything the tabs don't surface. On the Settings page, use
**Search settings** in the page header (or press ⌘K / Ctrl+K while on Settings)
to jump to a control by name or config key; keys that only exist in the raw file
open the **repoos.toml** tab. The global top-bar search (⌘K elsewhere) still
searches tasks, docs, and settings together.

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
defaultAssignee = "unassigned" # unassigned | ai | human
defaultTaskMode = "freeform"   # freeform | manual
maxActiveTasks = 3             # 1-20; used when auto-engineering is on
autoEngineeringMode = false
skillSuggestions = false
worktreeWarnThreshold = 20     # 0 disables the warning

# ── Server and UI ────────────────────────────────────────────────────────
servePort = 7171   # omit to derive a stable per-repo port (7200-7999)
strictBuild = false

# ── Close-out (Move to done) ─────────────────────────────────────────────
closeOut.timeoutMs = 360000  # 6-minute budget per close-out attempt; 0 = no limit

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

## Board behavior

```toml
defaultStatus = "inbox"
defaultAssignee = "unassigned"
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
| `defaultAssignee` | select | `unassigned` | yes | Default assignee for new tasks: `unassigned`, `ai`, or `human`. |
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

Constraints: a label is a string of at most 40 characters; blank labels,
duplicates of another column's label, or over-length values fall back to that
column's default. Any column you don't override keeps its default. The default
labels are `Draft`, `Inbox`, `Ready`, `Active`, `Review`, `Done`.

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

## UI handoff verification

```toml
uiVerification.enabled = true
uiVerification.viewportWidths = [1024, 375]
```

| Field | Type | Default | Committed | Effect |
| --- | --- | --- | --- | --- |
| `uiVerification.enabled` | boolean | `true` | yes | When enabled, tasks with a shot capture plan run browser checks at handoff (console errors, failed same-origin requests, horizontal overflow, blank captures) before review. It also blocks on missing or wrong visual evidence: a declared `highlight`/`selector` that matched nothing, a login/redirect that landed away from the declared route, or a declared `assert` condition (element count/text) that failed. Missing Playwright skips with a visible note. |
| `uiVerification.viewportWidths` | number[] | `[1024, 375]` | yes | Viewport widths (px) used for horizontal overflow checks during handoff verification. |

Edit both keys in **Settings → General**. Evidence is written under `.repoos/ui-verification/<task-id>.json` and surfaced on the task drawer **Changes** tab; it records the exact captured URL, whether the declared route matched, every assertion's outcome, and the tested tree/plan identity. Captured PNGs live under `work/.attachments/<task-id>/shots/` in the **main checkout** (not the task worktree), which is where a reviewer looks.

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

> **`[[preview.targets]]` and `[[preview.services]]` are deliberately TOML-only.**
> The Settings UI is built on a flat `key = value` schema, which cannot express a
> per-row sub-field of an array of tables; there is no control for target or
> service rows today. Editing `repoos.toml` is the supported path, and
> `repoos shot`'s area/target mismatch warning is what makes a stale `area:`
> visible. This is the documented exception to the "every feature setting needs
> a Settings control" rule, not an oversight.

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
