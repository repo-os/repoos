# Remote engineer sessions

::: warning Planned — not yet available
Running a whole engineer session on a remote runner is designed but not built
yet. This page records the intended setup and behavior so a runner can be
prepared ahead of time and so the design can be reviewed. Until the feature
ships, every engineer session runs on the machine hosting RepoOS.
:::

RepoOS already runs **checks, handoff/close-out gates and browser evidence** on
remote runners (see [Checks before merge](/check)). Remote engineer sessions
extend that to the engineer process itself: a task's engineer runs in its own
git worktree on a chosen host, while the board, transcript, review and close-out
stay on the machine you are using.

Local execution remains the default. A remote session is opt-in per repo and can
always fall back to local.

## What stays local, what moves

| Stays on your machine | Runs on the runner |
| --- | --- |
| Task file, task metadata and activity log | The engineer CLI and its child processes (build, tests) |
| The board, transcript view, messages, pause/resume controls | The git worktree for that turn and its commits |
| Review, the review lock, close-out and the merge pipeline | The runner's package cache and browser binaries |
| The canonical task branch after commits are fetched back | |

The runner does not receive your shell environment, `.env` file or API keys.
Credentials for the engineer CLI live on the runner; see the setup checklist
below.

## Intended configuration

These keys are the design accepted in ADR 0009; they are not read by RepoOS yet.

```toml
[remoteEngineers]
enabled = false                 # feature switch; local by default
placement = "local-first"       # "local-first" | "runner-first" | "runner-only"
maxPerHost = 1                  # concurrent engineer sessions per runner
heartbeatTimeoutSeconds = 90
recoverOnBoot = true            # re-attach across a RepoOS reload
fallbackToLocal = true          # start locally if no runner is usable
```

A host can override the concurrency cap on its existing pool row:

```toml
[[remoteValidation.tailscaleHosts]]
host = "bee"
labels = ["engineer-opencode"]  # CLIs this host can run
maxEngineers = 2
```

`placement` controls selection:

- **`local-first`** (default) — run locally unless the task or the board asks
  for a runner.
- **`runner-first`** — use the least-loaded healthy runner that provides the
  task's CLI, and fall back to local when none is usable.
- **`runner-only`** — never start locally; queue with a visible reason instead.

A host that is unreachable or under memory pressure is skipped, using the same
health probe remote checks use. If every eligible host is pressured, the start
queues and shows the same operating-system-specific fix the validation queue
shows.

## What the board shows

- Which host is running the engineer, and whether that host is healthy.
- `connection-lost` when the stream drops but the agent is still alive — the
  session reconnects and continues; it is not treated as a crash.
- `remote-crashed` when the supervisor is truly gone (reboot, OOM, kill), with
  the existing crash-resume path.
- `needs_input` for cases that need a person: a dirty worktree that could not
  be checkpointed, or a local tree that diverged from the fetched branch tip.

A remote run never starts a second engineer for the same task and never resets
your local branch automatically.

## Setup checklist (for the runner operator)

Do this once per host, as the user RepoOS SSHes in as. Never put a key in
`repoos.toml`, a task, a chat message, or a bundle.

1. Install the engineer CLIs your board may use (`opencode`, `codex`, `cursor`,
   `copilot`) for that user and make them available to a non-login SSH command.
2. Log in once per CLI **on the host** with the CLI's own login command. This
   writes its config under the runner user's home.
3. For API-key CLIs, put the key in `~/.config/repoos/engineer.env` (directory
   `700`, file `600`). The runner sources it; RepoOS never uploads it.
4. Prove a non-interactive run from the laptop, for example
   `ssh <host> 'cd /tmp && opencode run "say ok"'`. A CLI that needs a TTY or a
   browser callback fails here and must be fixed on the runner first.
5. Add an `engineer-<cli>` label for each installed CLI to that host's pool row,
   so placement only sends a task to a host that can run its CLI.
6. Optionally use a dedicated runner user, so a task's shell cannot read the
   operator's personal credentials beyond the CLI config directories.

Until a host has passed this checklist, leave remote engineer sessions off.
