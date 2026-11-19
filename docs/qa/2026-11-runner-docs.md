# Remote runner setup and health QA — November 2026

## Scope and method

Compared the runner setup recipes in `justfile` with `docs/remote-validation.md`,
the end-user runner description in `user-docs/check.md`, and the Checks → Remote
runners implementation and health DTO. No setup or provisioning recipe was run.
The first required `repoos check` unexpectedly started Tailscale remote
validation and emitted a link-probe result for `nick@thinkpad` (94 ms RTT,
10,779 KB/s). I interrupted it immediately after that output. A transient link
SSH interaction did occur, contrary to the task's no-SSH constraint. I checked
the implementation after the fact: the probe runs remote `true`, then sends its
payload to `cat > /dev/null`; it does not create a remote file. No setup or
persistent runner configuration change was requested. Subsequent local-tests
verification avoided another remote dispatch. Current service state, users,
PATH, and installed versions remain unverified.

The resumed session's final changed-path gate passed with `--local-tests` after
the runner-screen wording change. It ran the scoped tests and headless UI smoke
without contacting a configured runner.

## Findings

The recipes make setup account-specific. `setup-bee` and `setup-thinkpad`
delegate to `_setup-runner` for Arch/Docker; `setup-mini` uses the Docker path
for macOS and expects Docker Desktop to exist. Those paths stage the build in
the SSH user's home, install `/opt/repoos/validate.sh` with `sudo`, and use
Docker from the SSH account. The Arch recipe adds that account to the Docker
group, with the existing recipe warning that a new login may be needed.
`setup-mini-native` delegates to `_setup-runner-native`, which copies
`validate-macos.sh` to the SSH user's `~/.local/bin/repoos-validate` without
sudo. The Linux native recipe uses that same native helper.

The health display identifies a host as `user@host`; its probes and runner
commands use the configured SSH identity. The RepoOS server's local account is
not the remote runner account. If RepoOS runs as a systemd service under a
different local user, that service identity must independently be able to
authenticate to the configured SSH host and trust its host key. Its SSH agent,
home and local environment are not inherited from the person who ran `just`.
On the remote side, Docker access and native `PATH` are those of the configured
SSH account. The Runners view reports connectivity, prerequisites, run state,
and (when enabled) memory pressure; it does not establish that a separate
interactive user's environment is available to the server process.

## Changes

Expanded the runner setup material in `docs/remote-validation.md` with the
account boundary, recipe-specific destinations and permissions, and the
non-login PATH constraint. Added a concise end-user note to `user-docs/check.md`
so the `user@host` field is interpreted as the remote SSH login and service-only
authentication failures have a clear cause. Added regression coverage that
checks these explanations alongside the actual recipe markers in `justfile`.
The Remote runners screen now states that `user@host` is the remote SSH login,
that a systemd server account needs its own SSH credentials and trust, and that
ready status reflects checks as the configured SSH user. A component test
covers this wording. The underlying health labels remain consistent with the
configured SSH identity and existing health semantics.

## Evidence limits

This is primarily a comparison of checked-in scripts and source, not a live
audit of the three machines. The single observed link-probe result does not
establish which RepoOS service user is deployed, whether its SSH credentials
work reliably, or what PATH/Docker permissions the hosts currently expose.
Those claims require a human-side check in the relevant service context.
