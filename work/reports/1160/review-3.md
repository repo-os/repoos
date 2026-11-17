---
task: "1160"
pass: 3
at: "2026-11-17T21:19:35.710Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/remote-validation-let-any-project-run-it
state: ok
tree_identity: "9ffa55f69:9ffa55f69f"
---
## Verdict
`needs some work` — Docker hosts silently pass: repoos-ci's `bash -lc` entrypoint swallows the extra `bash -lc` argv, so the project gate never runs.

## Relevance
`still relevant` — main still runs only the fixed Bun gate remotely; nothing has superseded this, and the Tiao load problem stands.

## Evidence
None

## Bugs
- **Class: container entrypoint invocation / false green** — `scripts/remote-runner/validate.sh:329-353` invokes `"$IMAGE" bash -lc "$RUNNER_COMMAND"`, but the stock runner image sets `ENTRYPOINT ["/bin/bash","-lc"]` (`Dockerfile.ci:40`). Docker execs `/bin/bash -lc bash -lc "<script>"`; bash takes `bash` as its command string, the real script becomes `$1`, the nested non-interactive bash hits EOF and exits 0 (verified: `bash -lc bash -lc 'echo x'` prints nothing, exit 0). The documented default Docker host therefore reports green with no command output and empty artifacts. Same shape in the new Docker probe at `remote-validation.ts:2335`: required tools are never actually checked on repoos-ci. Fix both with `--entrypoint bash "$IMAGE" -lc …` (or a single command string), and add a test that executes the Docker branch — the new tests only substring-match.
- **Class: exit-code classification** — the same custom branch prints `[validate] gate exit $CODE` for every docker exit (125/126/127, the capture branch's pre-gate `exit 4`) and drops the stock branch's exit 4/5 remap. `classifyRemoteExecFailure` now bypasses every infra heuristic when that marker exists, so a container that never started is reported as a project test failure: no retry elsewhere, no host degraded.
- **Class: capability/doc mismatch** — `src/core/remote-hosts.ts:160` publishes `native` as a dispatch capability, so `runsOn = ["native"]` routes, while `docs/remote-validation.md:950` says native "is not a routing capability by itself" and `types.ts:1416` says jobs never request `runner`. Align one with the other.

No further findings of this class were found after grepping: both `validate.sh` branches, `validate-macos.sh`, `prereqProbeCommand` callers (`server.ts`, `TailscaleHostPool`), `hostCapabilities`/`hostSatisfies`, config schema/`settings-location`/`SettingsView`, `docs/remote-validation.md`, `user-docs/configuration.md`.

## Edge cases
- The Docker probe checks tools with the image's default `HOME`; the run sets `HOME=/repoos-cache/home`, so a per-user toolchain can pass the probe and miss the run.
- `selectValidateScriptCommand` prefers `~/.local/bin/repoos-validate` regardless of `runner`, so a host with both scripts installed runs the native script even when configured `docker`.
- Shot 2 highlights `.rvr-hosts` but shows only `could not spawn ssh` for all three hosts (preview sandbox), so no capture proves per-host toolchain status; there is also no live Android/Gradle run (engineer acknowledged this).

## Suggestions
- Re-capture the runner drawer where probe output is real; the handoff console log itself is clean (0 errors).
- `docs/remote-validation.md:527` still describes execution going through `/opt/repoos/validate.sh`.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T21:00:03.436Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

