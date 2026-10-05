# Agents

An agent is a coding-agent CLI that RepoOS runs headless, plus a model, a set of
instructions, and optionally a few skills. You configure all of it on the
**Agents** page, and RepoOS drives it — spawning the process, streaming its
output into the task, and recording its token spend.

Driving a whole board with agents? See
[Running a project with AI agents](/running-with-agents) for the practical loop.

## Supported coding agents

RepoOS has a driver for eight CLIs:

| CLI | Notes |
| --- | --- |
| `opencode` | The best-supported driver. Structured JSON output, live model discovery, and same-session resume. |
| `claude code` | Structured stream output; resume/recovery is less proven. |
| `codex` | Structured app-server protocol and a model list. |
| `github copilot` | JSON driver with Auto tier selection. |
| `qwen code` | Driver present; no machine-parseable output format. |
| `kiro` | Driver present. |
| `cursor` | The Cursor Agent CLI (`cursor-agent`). Structured stream-JSON, session resume, and model selection. |
| `antigravity` | Google Antigravity CLI (`agy`). Structured stream-JSON, model discovery, and exact conversation resume. |

A CLI has to be installable headless and drivable over stdin/stdout to be
useful here. If a tool is missing from `PATH`, the **Detected Coding Agents**
tab tells you whether it's installed and headless-ready, desktop-only, or
missing. For agents that report it (Cursor), the tab also shows whether the
CLI is signed in and the exact command to authenticate.

Use **Check for updates** in the Detected Coding Agents tab when you want to
compare installed versions. RepoOS does not check the network during startup or
ordinary detection, and it never installs or upgrades a CLI. On demand it uses
only a source it can establish from the binary path (currently npm, a Homebrew
formula or cask, or an official GitHub release endpoint); otherwise the row says
**check manually**. Results are cached for six hours and show the source and
checked time. After the first check the button becomes **Refresh update
checks**, which re-scans PATH and bypasses the cache. A copyable upgrade command appears only when the source provides a
matching safe command; you must run it yourself. Registry failures, timeouts,
and opaque vendor versions remain per-agent **could not check** or **check
manually** states rather than hiding the detected-agent list.

The row also shows a versioned compatibility status. `PATH` detection alone is
not certification: **verified**, **upgrade recommended**, **newer than
verified**, and **unsupported** describe the adapter contract, not model
quality or task success. See the [Supported coding harness versions](/coding-harness-compatibility)
table for certified ranges, evidence, and safe upgrade guidance.

### Cursor Agent CLI

Install with Cursor's official installer:

```bash
curl https://cursor.com/install -fsS | bash
```

RepoOS detects and launches only the `cursor-agent` binary — never a bare
`agent` command, which can collide with another tool on `PATH`. Authenticate
once with `cursor-agent login` (or set `CURSOR_API_KEY` for automation); the
Detected Coding Agents tab shows sign-in state when it can probe it.

RepoOS runs Cursor in print mode with `--output-format stream-json` inside the
task's dedicated worktree, with `--trust` and `--force` so worktree edits and
`repoos check` run without waiting for an approval that can never be answered
(the process has no interactive stdin). Follow-up messages resume the exact
session Cursor reported; RepoOS deliberately never uses `--continue`, which
could attach a different task's most recent session. Models come from
`cursor-agent --list-models`, with `default` meaning Cursor's own choice.

Cursor's current stream-JSON output does not include token or cost usage. The
Tokens page therefore records the session but can show zero usage for Cursor;
that is a CLI limitation rather than an indication that RepoOS lost the run.

## The Agents page

The page is organised into tabs:

- **Default Agents** — the lifecycle roles RepoOS ships with.
- **Custom Agents** — your own roles.
- **Build Your Team** — built-in agents and chat assistants (see below).
- **Detected Coding Agents** — what's installed on this machine.
- **Model Playground** — try a prompt against a CLI/model and compare output.
- **Model providers** — live spend where a provider exposes an API (OpenRouter,
  opencode Go, DeepInfra), plus links to provider dashboards such as Cursor's
  Spending page. GitHub Copilot is a link-out too: GitHub has deprecated the
  personal-account billing endpoints and offers no public API for individual
  Copilot subscription, billing or usage data, so its row links to the
  Copilot settings page instead.

Every role card lets you pick the coding agent and model, toggle the role on or
off, edit its instructions, and **Test** the combination to see whether the CLI
and model actually respond. A test that finds nothing is reported as **cold
start** (no output within the CLI's startup window) rather than a hard failure,
and a failure shows the actual line the CLI printed — for example
`Error: Model unavailable: …` — not a truncated dump of the event stream. Each
CLI gets its own startup ceiling (a cold `cursor` or `pi` gets longer than a
one-shot `opencode`), so a slow first token is not mistaken for a broken model.
**Refresh models** re-probes every CLI's live model
list (`opencode models --refresh` for opencode, and the equivalent for each
other installed CLI) — model names change often, so pick from live discovery
rather than a hardcoded list. Each CLI loads independently: one slow or failing
CLI never empties the other dropdowns, a failing one shows its reason (not
found on PATH, timed out, not signed in…) with a **Retry**, and the last good
list per CLI is saved in your browser so a reload shows it immediately while it
revalidates. A model of `default` uses whatever the CLI itself defaults to,
except for GitHub Copilot: it means **Auto · Efficiency**, the lowest-cost Auto
tier.

### Codex engineering permissions

Managed Codex engineering runs and follow-ups use
`--dangerously-bypass-approvals-and-sandbox`. This removes the OS sandbox and
approval prompts so unattended builds and browser checks can run. In particular,
macOS WebKit can abort during application registration in the workspace-write
sandbox even when networking is enabled.

Commands run with your user's normal access, including access outside the task
worktree. A worktree separates Git changes; it is not a security boundary. Use
this mode for trusted projects and task prompts, and review changes before
landing them. Read-only/advisory Codex roles retain their existing permissions.
Existing running turns keep their launch permissions; the change applies to new
engineering turns and resumed follow-ups after the server loads the new build.

### GitHub Copilot CLI

RepoOS offers Copilot's three Auto tiers: **Auto · Efficiency** (the default),
**Auto · Balance**, and **Auto · Intelligence**. They choose from models your
Copilot account and policy make available; the tier controls the cost, quality,
and latency trade-off rather than pinning a named model. RepoOS uses Copilot's
documented `--model auto --auto-tier <tier>` flags, so it does not need to
scrape the interactive `/model` picker.

RepoOS passes Copilot's `--yolo` flag (all tools, paths and URLs) for every role:
engineer, PM, reviewer, Debugger, RepoOS Guide, and one-shot authoring. Copilot
cannot stop for a human approval prompt during a headless run, and any denial
fails the task. Role prompts state the intended work but do not enforce
read-only access; the repo's git history is the safety net.

| RepoOS role | Intended work with approved tools |
| --- | --- |
| Engineer | Implement, build, and test in the task worktree. |
| Task PM chat | Use RepoOS task-management commands as directed by its prompt. |
| Reviewer | Inspect the diff and report findings without editing. |
| Freeform PM, Debugger, and RepoOS Guide | Author or inspect as directed by their prompts. |

### Antigravity CLI (`agy`)

Install the official CLI with:

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

On Windows, use the official PowerShell installer from the [Installation & auth
guide](https://antigravity.google/docs/cli-install). Sign in once by running
`agy` interactively. Local runs use the operating system keyring; SSH runs show
a browser URL and one-time code to paste back into the remote terminal. A
headless API-key setup requires `modelProvider = "gemini"` in Antigravity's
settings and `GEMINI_API_KEY` in the process environment. RepoOS never reads,
stores, or displays that key.

RepoOS invokes only the official `agy` binary from `PATH`, in the task's linked
worktree, with the documented `-p --output-format stream-json` protocol. It
parses only Antigravity's `init`, `step_update`, and `result` events, including
tool output, stderr diagnostics, terminal status, duration, model, and usage
fields that `agy` actually reports. Unknown or malformed events are shown as a
helpful protocol error rather than copied into the transcript as JSON.

Models are read from `agy models`; a pinned model is passed with `--model`, and
an unavailable pin fails instead of silently falling back. Follow-ups resume
the exact `conversation_id` with `--conversation`. If Antigravity does not
report an id, RepoOS starts a labelled fresh turn rather than risking another
task's conversation.

Headless Antigravity normally soft-denies shell commands because there is no
interactive approval prompt. RepoOS therefore uses
`--dangerously-skip-permissions` for managed task, review, and check runs so a
task cannot wait forever. This is a blanket permission bypass: it can approve
commands beyond the worktree, so use Antigravity only with trusted prompts and
remember that RepoOS's isolation is the worktree/lifecycle boundary, not a
replacement for Antigravity's own sandbox. Because of that, RepoOS refuses to
run Antigravity with the bypass anywhere but a task worktree: it can't drive
board-level roles that work in the main checkout (Ross, the CTO, the debugger).
Read-only uses, such as model tests and PM task authoring, run without the
bypass.

### Gemini CLI deprecation

The legacy `gemini` executable is no longer part of the **Detected Coding
Agents** catalog, and RepoOS does not probe for it. New agent assignments offer
Antigravity instead. A saved legacy Gemini selection (`cli = "gemini"`) is
preserved and shown with a migration warning in the task and agent editors;
RepoOS does not silently rewrite it or invoke Gemini as a fallback driver.

## The lifecycle roles

These run as part of a task's life. They're what the `pm`, `engineer`, and
`reviewer` names in a task's history refer to:

- **engineer** — implements the task. Reads the task file, writes the code in
  the task's own worktree, runs `repoos check`, and then *asks* for the task to
  move to `review` (via `repoos mv <id> review` or the handoff signal) rather
  than moving it. RepoOS finalizes that request when the turn ends: it re-runs
  the check, commits the branch and moves the status. It never merges.
- **reviewer** — reads the branch diff the moment a task lands in `review` and
  writes an advisory report: bugs, edge cases, suggestions. It changes nothing
  and never moves a task. See [Review and close-out](/review-and-close-out).
- **pm** — owns the roadmap: moves tasks between statuses and keeps the board
  tidy. `repoos new-doc` goes through it.
- **Ross** — a repository assistant you can chat with. Answers questions about
  the repo; never edits files or changes task state.
- **cto** — an optional always-on board monitor. Off by default; watches for
  stuck tasks, stale reviews and broken builds, and reports rather than acts.
  It runs read-only where its CLI supports it, and RepoOS quarantines any stray
  file a run still creates (moved under `.repoos/quarantine/` and reported in
  the run's report) so the main checkout is never left dirty.
  While the board is healthy it makes no model call at all: it only runs the
  agent when something needs attention, or when the material board signal
  changes. Every CTO run records what triggered it, and a failed run records a
  truncated reason, so provider credit/auth failures show up on the Tokens
  panel instead of disappearing. Tune this with `ctoSkipHealthy` on the
  Settings page — see [Configuration](/configuration#agents).

When you assign a task to an agent from the UI, RepoOS creates a dedicated git
worktree and branch for that task and runs the agent there. A task can override
the agent, CLI, and model its reviewer uses without changing the global default.
How many agents run at once is governed by `maxConcurrentAgents` in
`repoos.toml`; extras queue. The default sizing is derived from your machine's
core count — see [Configuration](/configuration#agents).

## Built-in agents are a different thing

The **Build Your Team** tab also holds **built-in agents**: Tech Debt,
Performance, Architect, Design, Docs Debt, and a Debugger assistant. Don't
confuse them with the lifecycle roles above — they are not roles a task moves
through:

- They run **on demand or on a schedule** (daily, weekly, or manual only), not
  as part of a task's lifecycle.
- Each has its **own** coding-agent and model selection, separate from the
  lifecycle roles.
- They **produce findings**, not implementation: Tech Debt and Performance
  create tasks in your inbox for each issue; all built-in agents write durable
  run records under your configured docs directory; Docs Debt fixes what it safely can and
  bundles the rest into a single task.

Each of them — what it scans for, how to schedule it, and what good output looks
like — has its own section in [Built-in agents](/built-in-agents).
