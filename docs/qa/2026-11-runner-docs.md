# Remote runner setup and health QA — November 2026

## Scope and method

Compared the runner setup recipes in `justfile` with `docs/remote-validation.md`,
the end-user runner description in `user-docs/check.md`, and the Checks → Remote
runners implementation and health DTO. This was a source-only review. No SSH
commands were run and bee, thinkpad, and mini were not contacted or changed, so
this report makes no claim about their current reachability, service state,
users, PATH, or installed versions.

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
No UI code changed; the existing display is consistent with configured SSH
identity and current health semantics.

## Evidence limits

This is a comparison of checked-in scripts and source, not a live audit of the
three machines. In particular, it cannot establish which RepoOS service user is
currently deployed, whether its SSH credentials work, or what PATH/Docker
permissions the hosts currently expose. Those claims require an authorized
human-side check in the relevant service context.
