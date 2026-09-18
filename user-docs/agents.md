# Agents

An agent is a coding-agent CLI that RepoOS runs headless, plus a model, a set of
instructions, and optionally a few skills. You configure all of it on the
**Agents** page, and RepoOS drives it — spawning the process, streaming its
output into the task, and recording its token spend.

## Supported coding agents

RepoOS has a driver for seven CLIs:

| CLI | Notes |
| --- | --- |
| `opencode` | The best-supported driver. Structured JSON output, live model discovery, and same-session resume. |
| `claude code` | Structured stream output; resume/recovery is less proven. |
| `codex` | Structured app-server protocol and a model list. |
| `github copilot` | JSON driver with Auto tier selection. |
| `qwen code` | Driver present; no machine-parseable output format. |
| `kiro` | Driver present. |
| `cursor` | The Cursor Agent CLI (`cursor-agent`). Structured stream-JSON, session resume, and model selection. |

A CLI has to be installable headless and drivable over stdin/stdout to be
useful here. If a tool is missing from `PATH`, the **Detected Coding Agents**
tab tells you whether it's installed and headless-ready, desktop-only, or
missing. For agents that report it (Cursor), the tab also shows whether the
CLI is signed in and the exact command to authenticate.

Use **Check for updates** in the Detected Coding Agents tab when you want to
compare installed versions. RepoOS does not check the network during startup or
ordinary detection, and it never installs or upgrades a CLI. On demand it uses
only a source it can establish from the binary path (currently npm, Homebrew,
or an official GitHub release endpoint); otherwise the row says **check
manually**. Results are cached for six hours and show the source and checked
time. A copyable upgrade command appears only when the source provides a
matching safe command; you must run it yourself. Registry failures, timeouts,
and opaque vendor versions remain per-agent **could not check** or **check
manually** states rather than hiding the detected-agent list.

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
- **Model providers** — live spend where a provider exposes an API, plus links
  to provider dashboards such as Cursor’s Spending page.

Every role card lets you pick the coding agent and model, toggle the role on or
off, edit its instructions, and **Test** the combination to see whether the CLI
and model actually respond. For `opencode`, **Refresh models** re-probes the
live model list (`opencode models --refresh`) — model names change often, so
pick from live discovery rather than a hardcoded list. A model of `default`
uses whatever the CLI itself defaults to, except for GitHub Copilot: it means
**Auto · Efficiency**, the lowest-cost Auto tier.

### GitHub Copilot CLI

RepoOS offers Copilot's three Auto tiers: **Auto · Efficiency** (the default),
**Auto · Balance**, and **Auto · Intelligence**. They choose from models your
Copilot account and policy make available; the tier controls the cost, quality,
and latency trade-off rather than pinning a named model. RepoOS uses Copilot's
documented `--model auto --auto-tier <tier>` flags, so it does not need to
scrape the interactive `/model` picker.

## The lifecycle roles

These run as part of a task's life. They're what the `pm`, `engineer`, and
`reviewer` names in a task's history refer to:

- **engineer** — implements the task. Reads the task file, writes the code in
  the task's own worktree, runs `repoos check`, and moves the task to `review`
  when done. It never merges.
- **reviewer** — reads the branch diff the moment a task lands in `review` and
  writes an advisory report: bugs, edge cases, suggestions. It changes nothing
  and never moves a task. See [Review and close-out](/review-and-close-out).
- **pm** — owns the roadmap: moves tasks between statuses and keeps the board
  tidy. `repoos new-doc` goes through it.
- **Ross** — a repository assistant you can chat with. Answers questions about
  the repo; never edits files or changes task state.
- **cto** — an optional always-on board monitor. Off by default; watches for
  stuck tasks, stale reviews and broken builds, and reports rather than acts.

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
  create tasks in your inbox for each issue; Architect and Design write markdown
  reports under `docs/agents/<Agent>/`; Docs Debt fixes what it safely can and
  bundles the rest into a single task.

Each of them — what it scans for, how to schedule it, and what good output looks
like — has its own section in [Built-in agents](/built-in-agents).
