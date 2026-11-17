---
task: "1160"
pass: 2
at: "2026-11-17T19:12:55.108Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/remote-validation-let-any-project-run-it
state: ok
tree_identity: "a12017808:a120178080"
---
## Verdict

`needs some work` — the dispatch env prefix is split by a `;`, so `remoteValidation.command` (and slot/capture/image vars) never reaches the runner; Docker path would false-green.

## Relevance

`still relevant` — main still runs only the fixed Bun gate remotely; nothing landed that supersedes this, and the earlier-pass items (Settings rows, container name, probe shell, capability handshake) are genuinely fixed.

## Evidence

None

## Bugs

- **Class: env forwarding / assignment-prefix split** — `validateScriptArgs` (`src/server/remote-validation.ts:2972-2976`) now emits `REPOOS_*='…' REPOOS_VALIDATE_SCRIPT=…; [ -x … ] || …; "$REPOOS_VALIDATE_SCRIPT" args`. The prefix is an assignment-only statement, so nothing is exported to the child: `REPOOS_SLOT`, `REPOOS_CONTAINER`, `REPOOS_CACHE_VOLUME`, `REPOOS_CI_IMAGE`, `REPOOS_CHECK_PROFILE`, `REPOOS_OFFLOAD_BROWSER_STEPS`, `REPOOS_BROWSER_CAPTURE_*`, `REPOOS_VALIDATION_COMMAND` all arrive empty (verified: `A=1; sh -c 'echo $A'` prints empty). So the project command never runs on any host, browser capture/offload never trigger remotely, and hang-kill container names plus per-slot cache isolation (#0729) regress for every existing run. Callers: `TailscaleRunner` (`:7115`) and `RemoteValidationRunner` (`:4055`).
- **Class: env forwarding / assignment-prefix split** — even once exported, `scripts/remote-runner/validate.sh:329-352` never passes `-e REPOOS_VALIDATION_COMMAND` into `docker run`, so the inner `bash -lc "$REPOOS_VALIDATION_COMMAND"` runs `bash -lc ""` → exit 0, empty `test-output.log`: a Docker host reports a green gate without running anything (confirmed `bash -lc ""` = 0).
- **Class: exit-code contract** — `validate.sh` (`exit "$CODE"`) and `validate-macos.sh:93` forward the project command's raw code; `classifyRemoteExecFailure` (`:1416-1433`) treats 3/4/5 as transport/setup *before* checking `[validate] gate exit`, so a project command exiting 3/4/5 is retried as infra instead of failing the gate.
- **Class: duplicated schema control branch** — `SettingsView.vue:1748-1764` adds string/array branches ahead of the existing ones (`:1797-1813`) in the generic General card; the array branch wins and drops `arrayPlaceholder()`, so `areas`, `release.email.to`, etc. now show the hard-coded `java, gradle, node` hint. Only the Remote-validation card insertion was needed.

No further findings of this class were found after grepping: both callers, both runner scripts, `hostLockShell`, `docker run` env lists, probe helpers, schema/`SUPPORTED_TOML_KEYS`/user-docs, settings-location/SettingsView/tests.

## Edge cases

- No capture of Settings → Remote validation or the per-host status: the single auto shot is `/` (Mission Control), so the "Settings shows command + per-host toolchain status" criterion has no usable visual evidence.
- No test dispatches the generated line through a shell; tests only assert `REPOOS_CONTAINER=` is *present*, which is why the prefix split slipped through.
- No new queue/fallback test with a command set; `native` is now an implicit capability with no docs.

## Suggestions

Re-capture `/settings?tab=general&section=remote-validation` and the runner drawer; add a test that runs `hostLockShell(...)` output against a stub script and asserts the env values; export the prefix (or use `env VAR=… script`) rather than adding `;`.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T19:04:42.124Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

