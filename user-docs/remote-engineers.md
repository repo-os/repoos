# Remote engineer sessions

RepoOS does not currently run the managed engineer process on a remote runner.
Managed engineers run on the machine hosting RepoOS. Remote runners can run
checks and browser evidence, and can perform the self-check for a managed
engineer when remote validation is enabled.

This distinction matters: the task worktree, engineer CLI, and its child
processes stay on the RepoOS host. With remote validation enabled, the managed
engineer's self-check sends a verified checkout to a configured validation
runner for install, build, and tests; format and lint remain local. A successful
remote pass for the same commit can be reused at handoff. Turn this off with
`remoteValidation.engineerSelfCheckRemote = false` to run install, build, tests,
format, and lint on the RepoOS host. With remote validation disabled, the
self-check runs locally.

## Configure remote validation

Remote validation is opt-in. Enable it in **Settings → Remote validation** or
in `repoos.toml`, choose a provider, and configure at least one runner host.
The Tailscale provider can use a single `tailscaleHost` or a pool of
`tailscaleHosts`; see [Checks before merge](/check) and the
[repoos.toml reference](/configuration#remote-validation) for host setup,
selection, required tools, and fallback behavior.

```toml
[remoteValidation]
enabled = true
provider = "tailscale"
tailscaleHosts = ["runner-one", "runner-two"]
```

`remoteValidation.engineerSelfCheckRemote` defaults to `true` when remote
validation is enabled; set it to `false` only when you want those self-checks
to run locally.

Runner hosts need the tools required by the project check plan. Declare
`requires` on check steps and use `runsOn` when a remote step needs a particular
host capability. `repoos runners check` probes configured hosts and declared
engineer CLIs; `repoos runners setup` can install the runner-side validation
runtime. Engineer CLI credentials are separate from project secrets and are
not uploaded with the checkout.

## What runs where

| Work | Location |
| --- | --- |
| Managed engineer CLI and child processes | RepoOS host |
| Task worktree and task branch | RepoOS host |
| Format and lint in the engineer self-check gate | RepoOS host |
| Install, build, and tests in the engineer self-check gate, when enabled | Validation runner |
| Handoff, close-out and merge decision | RepoOS server |

The remote gate reports runner selection, progress, failures, and queued work
through the Checks and task views. Runner unavailability follows the configured
remote-validation fallback policy; it does not move the engineer session to a
runner.
