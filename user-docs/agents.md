# Agents

An agent is a coding-agent CLI that RepoOS runs headless, plus a model, a set of
instructions, and optionally a few skills. You configure all of it on the
**Agents** page, and RepoOS drives it — spawning the process, streaming its
output into the task, and recording its token spend.

## Supported coding agents

RepoOS has a driver for six CLIs:

| CLI | Notes |
| --- | --- |
| `opencode` | The best-supported driver. Structured JSON output, live model discovery, and same-session resume. |
| `claude code` | Structured stream output; resume/recovery is less proven. |
| `codex` | Structured app-server protocol and a model list. |
| `github copilot` | Driver present; capabilities vary. |
| `qwen code` | Driver present; no machine-parseable output format. |
| `kiro` | Driver present. |

A CLI has to be installable headless and drivable over stdin/stdout to be
useful here. If a tool is missing from `PATH`, the **Detected Coding Agents**
tab tells you whether it's installed and headless-ready, desktop-only, or
missing.

## The Agents page

The page is organised into tabs:

- **Default Agents** — the lifecycle roles RepoOS ships with.
- **Custom Agents** — your own roles.
- **Build Your Team** — built-in agents and chat assistants (see below).
- **Detected Coding Agents** — what's installed on this machine.
- **Model Playground** — try a prompt against a CLI/model and compare output.
- **Model providers** — credentials/registration for the CLIs that need them.

Every role card lets you pick the coding agent and model, toggle the role on or
off, edit its instructions, and **Test** the combination to see whether the CLI
and model actually respond. For `opencode`, **Refresh models** re-probes the
live model list (`opencode models --refresh`) — model names change often, so
pick from live discovery rather than a hardcoded list. A model of `default`
uses whatever the CLI itself defaults to.

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
Performance, Architect, Design, and a Debugger assistant. Don't confuse them
with the lifecycle roles above — they are not roles a task moves through:

- They run **on demand or on a schedule** (daily, weekly, or manual only), not
  as part of a task's lifecycle.
- Each has its **own** coding-agent and model selection, separate from the
  lifecycle roles.
- They **produce findings**, not implementation: Tech Debt and Performance
  create tasks in your inbox for each issue; Architect and Design write markdown
  reports under `docs/agents/<Agent>/`.

A Docs Debt built-in agent is planned. A full deep-dive on the built-in agents —
one section each, with config and what "good" output looks like — is a separate
page, not covered here.
