---
task: "1160"
pass: 5
at: "2026-11-17T23:15:03.197Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/remote-validation-let-any-project-run-it
state: ok
tree_identity: "babb0e25c:babb0e25cb"
---
## Verdict
`good to go` — STALE-EVIDENCE-ONLY: only captures predate HEAD, by non-UI commits; all pass-4 findings fixed.

## Relevance
`still relevant` — main still has the fixed Bun-only remote gate (verified `git show main:src/server/remote-validation.ts` and `main:docs/remote-validation.md`), so non-Bun projects still cannot use the pool.

## Evidence
None

## Bugs
None found
No further findings of this class were found after grepping: both runner scripts, `prereqProbeCommand`/`validateScriptArgs`/`selectValidateScriptCommand`/`exportRemoteEnvironment` callers, `classifyRemoteExecFailure`/`remoteRunHasGateExit`, `hostCapabilities`/`hostSatisfies`, config parser/schema/`SUPPORTED_TOML_KEYS`, `settings-location`/`SettingsView`/drawer, `user-docs`, Hetzner provisioning, justfile recipes, and the `validate-env-isolation` key list.

## Edge cases
- Pass-4 findings verified fixed: native capture worktree now lives under `$WORK` (test runs two captures + a failed setup); 125/126/127 only remap to exit 5 without a gate marker; cache-volume create/prep exits 5; Hetzner probes command support and returns an update command instead of silently running Bun.
- Round-5 report (source `babb0e25c`) matches the reviewed tree; the report text in the handoff was round 4 (`ccebd42`). Its claimed native-capture test exists in `remote-custom-command-docker.test.ts`.
- No live Tiao/Gradle/Android or real multi-host run; the engineer says so plainly. Fixture/probe tests cover the contract, not the environment.
- Landing: only this task's `work/*.md` conflicts (close-out takes main's copy); no source conflict or landing blocker.
- Console log at capture: zero errors.

## Suggestions (non-blocking)
- Re-capture both declared shots on `babb0e25`/`62c89be` (UI code is identical since `ccebd42`). Shot 2's `.rvr-hosts` shows preview's "could not spawn ssh" for all hosts, so no capture proves a healthy per-host toolchain status — sandbox limitation, not a defect.
- `validateScriptCommandByIp` caches `false` forever on the Hetzner path: after updating the snapshot script as the error instructs, the runner keeps refusing until restart (`validateScriptMirrorByIp` re-probes).
- `selectValidateScriptCommand` prefers `~/.local/bin/repoos-validate` regardless of `runner`; a leftover native install on a host switched to `runner = "docker"` wins silently.
- Docker tool probe uses the image's default user/`HOME`, while the run uses `--user` and `HOME=/repoos-cache/home`; a per-user toolchain can pass the probe and fail the run.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T23:13:47.428Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

