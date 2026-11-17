---
task: "1160"
pass: 1
at: "2026-11-17T18:00:01.625Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/remote-validation-let-any-project-run-it
state: ok
tree_identity: "1f3d5871f:"
---
## Verdict
`needs some work` — Settings exposes no control for the new keys (explicit criterion), and the Docker custom-command path drops hang-kill/teardown naming.

## Relevance
`still relevant` — main still runs only the fixed Bun gate remotely; nothing else has landed that supersedes this.

## Evidence
None

## Bugs
- **Class: config-key/Settings registration** — `remoteValidation.command`/`requiredTools` are schema-only. They are absent from `REMOTE_VALIDATION_GENERAL_FIELD_KEYS` and `generalSectionForKey` (`src/ui-app/src/settings-location.ts:197,217,235`), so `resolveSettingLocation` returns `{tab:"toml",hasUiRow:false}`; `isGeneralSchemaFieldKey` rejects every unlisted `remoteValidation.*`. Worse, the Remote-validation card (`src/ui-app/src/views/SettingsView.vue:1942-1985`) renders only `select`/`boolean`, so even a registered `string`/`array` key would show no input. "Settings → Remote validation shows the command" is unmet, contra the report's "schema-driven Settings controls"; AGENTS.md requires a control plus test, and none was added.
- **Class: container lifecycle/naming** — the custom branch in `scripts/remote-runner/validate.sh:291-310` runs `docker run --rm` without `--name "$CONTAINER"`. Hang recovery's `docker stats` (`remote-validation.ts:1777`) and `killContainerCommand` (`:1213`) target a name that never exists; the "No such container" case returns 0, so `finalizeHungKill` (`:6513-6530`) records "killed", deletes `paths.artifacts` *while the container writes to it*, and releases the slot — a second run then starts on a one-slot host. The prefix reaper and the EXIT trap cannot see it either. The stock path (`--name "$CONTAINER"`) is the sibling that behaves.
- **Class: probe/execution environment mismatch** — the native probe checks tools with `command -v` over sshd's non-login PATH (`remote-validation.ts:2277-2287`), while the command runs under `bash -lc` with `/opt/homebrew/bin` prepended (`validate-macos.sh:41,52-55`). Tools installed as the docs instruct (SDKMAN/nvm/Android SDK on the *login* PATH, brew node on mini) are reported missing; only `bun` has a special case. Sibling: the Docker probe uses `sh -lc` while the run uses `bash -lc`.
- **Class: runner-script capability handshake** — nothing probes for custom-command support. A host whose `/opt/repoos/validate.sh` predates this change silently ignores `REPOOS_VALIDATION_COMMAND` and runs the Bun gate. The codebase already does this for mirror support (`RUNNER_SCRIPT_MIRROR_TOKEN`, `'${3'` grep) at `remote-validation.ts:2367-2374`.
- **Class: documentation/behavior mismatch** — `docs/remote-validation.md:768` says "Docker hosts continue to use the stock image gate", but `validate.sh` runs the project command in the image; `:623` still says native is "macOS only today" and Bun-only; `:633-635` omit `setup-linux-native`; `:695-698` still say other projects get the fixed Bun sequence.
- **Class: documented setup commands** — `docs/remote-validation.md:755-758` uses GNU-only `install -Dm755` on a page covering macOS, and copies the script to `~/.local/bin` although the dispatcher only invokes `/opt/repoos/validate.sh`, so the advertised non-sudo step is dead.

No further findings of this class were found after grepping: config schema/`SUPPORTED_TOML_KEYS`/`user-docs/configuration.md`, `settings-location.ts`, `SettingsView.vue`, both runner classes, both validate scripts, `prereqProbeCommand` callers (`server.ts`, `TailscaleHostPool`), justfile setup recipes, and both docs sections.

## Edge cases
- `requiredTools` set without `command` drops the Bun probe even though the stock gate still runs Bun; Docker also then requires those tools in the image.
- Setting a command silently disables browser capture/offload (`REPOOS_OFFLOAD_BROWSER_STEPS` unused) and any persistent cache (`HOME=/repo`, checkout deleted per run), which will make Gradle runs very slow.
- No live Android/Gradle or multi-host queue/fallback run with a command exists; only the local fixture.

## Suggestions
Add the two Settings rows with a test, add a probe token for command support, and add a fallback/queue test with a command set.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

