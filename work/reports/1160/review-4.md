---
task: "1160"
pass: 4
at: "2026-11-17T22:37:31.435Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/remote-validation-let-any-project-run-it
state: ok
tree_identity: "ccebd42cd:ccebd42cd9"
---
## Verdict
`needs some work` — native capture worktree reuse/leak, setup-vs-gate misclassification, and Hetzner silently ignoring the new command.

## Relevance
`still relevant` — main still only runs the fixed Bun gate remotely, so non-Bun projects still cannot use the pool and the Tiao load problem stands.

## Evidence
None

## Bugs
- **Class: lifecycle/teardown** — `scripts/remote-runner/validate-macos.sh:55-60` creates `$HOME/.repoos-worktrees/<branch>` with `git worktree add -b` and never removes it (the trap only clears `$WORK`/`$BUNDLE`). A second capture of the same task branch dies with "a branch named … already exists", and every capture leaks a checkout plus `node_modules` on the host. The Docker sibling (`validate.sh:167,305`) builds under per-run `$WORK` and cleans it.
- **Class: exit-code classification** — the gate-started marker is honoured only for exit 4. (a) `validate.sh:358-361` maps 125/126/127 to "container could not start" (exit 5), so a project command legitimately exiting 126/127 is called an infra failure, the host is degraded and retried elsewhere. (b) `validate.sh:297-299` runs the volume create/root prep under `set -e` with no `|| { …; exit 5; }` guard (stock branch has one at `:385`), so a Docker/image failure exits raw and classifies as a project test failure. (c) `validate-macos.sh:60` — the new capture branch's `bun install … || exit 4` still reaches the unconditional `[validate] gate exit 4` (`:92`), reporting a setup failure as a project failure with no retry.
- **Class: capability handshake** — `src/server/remote-validation.ts:3722,3972` only probes `MIRROR` for Hetzner. A VM built from a pre-#1160 snapshot silently ignores `remoteValidation.command` and runs the stock Bun gate with no warning, while the Tailscale pool now fails the probe (`:5960-5983`). Hetzner is the default provider.

No further findings of this class were found after grepping: both runner scripts, `prereqProbeCommand`/`validateScriptArgs`/`selectValidateScriptCommand` callers, `hostCapabilities`, config schema/`SUPPORTED_TOML_KEYS`/`settings-location`/`SettingsView`, `user-docs/configuration.md`, Hetzner provisioning.

## Edge cases
- Earlier-pass items (Settings row, exported env, Docker command forwarding, `--entrypoint`, native capability) are fixed — verified.
- Reviewed HEAD `ccebd42cd` has no matching engineering report (source `9ffa55f`); the last two commits' changes are un-reported.
- `selectValidateScriptCommand` prefers `~/.local/bin/repoos-validate` regardless of `runner`: switching a host native→docker via `just setup-<host>` leaves the native script preferred while the probe still reports healthy.
- The Docker tool probe runs with the image's default HOME/user; runs use `HOME=/repoos-cache/home`, so a per-user toolchain can pass the probe and fail the run.

## Suggestions
- Re-capture both declared shots on the reviewed tree (handoff capture is `9ffa55f69f`, not HEAD; only non-UI files changed since). Shot 2 shows `could not spawn ssh` for all three hosts, so it does not evidence a healthy per-host toolchain status.
- `docs/remote-validation.md:527` still describes only `/opt/repoos/validate.sh`.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T22:31:11.359Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

