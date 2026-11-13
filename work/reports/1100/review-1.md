---
task: "1100"
pass: 1
at: "2026-11-13T03:41:12.496Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/linux-service-install-omits-path-so-agen
state: ok
tree_identity: "914a5064f:"
---
## Verdict

`good to go` — Linux systemd units get install-time PATH, pre-install CLI checks, and async spawn ENOENT surfaces on the task via `sys` + dev-error detail.

## Relevance

`still relevant` — systemd user units still omit shell PATH by default; launchd already wrote PATH and was left unchanged.

## Evidence

None

## Bugs

None found

## Edge cases

- Existing units keep the old PATH until reinstall; this patch fixes new installs and the async ENOENT path that produced empty logs on laisen.
- `missingConfiguredAgentCli` uses a local `executableByCli` map (cursor/opencode added in the engineer round); other CLIs use `agent.cli` as the binary name, matching spawn for codex/crush/pi.
- ENOENT reporting uses `process.env.PATH`, not the child `agentEnv` after engineer shims; fine for the systemd-PATH incident, slightly wrong if only the shimmed PATH differs.
- Engineer report source SHA `956ac069` predates doc-only HEAD `914a506`; implementation is unchanged since the WIP checkpoint.

## Suggestions

- Consider sharing CLI→binary resolution with spawn command building so install-time `which` checks cannot drift.
- Optional test for `missingConfiguredAgentCli` refusal (not required by the spec).

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

