# Settings and Agents QA — November 2026

## Scope and setup

- Worktree: `feat/qa-pass-settings-and-agents-pages-every-`.
- Started `just serve-noauth 7272` from this worktree and drove the app at `http://127.0.0.1:7272` in Chrome.
- The server identified itself as a preview build on the task branch. Settings showed the banner `Preview servers are read-only`.
- No values were changed in this worktree or its project config. Save and reload checks ran against isolated scratch config roots under `.repoos/`; no credentials, provider keys, tokens, shared budget groups, schedules, agent assignments, or task state in the worktree were edited.

## Settings page

Visited all Settings tabs: General, Notifications, Security, Advanced, Import/Export, Support, and `repoos.toml`. General’s visible sections included Themes, Activity animation, Performance, General, Model routing, Close-out, Automation & approval, Screenshots, Attachments, Background service, Publishing, Release emails, Remote validation, and Board.

The UI exposed the expected controls and context descriptions. Security showed authentication disabled in this auth-less instance. Import/Export exposed export controls. The raw TOML tab was viewed but not edited. Support’s private diagnostics preview remained in its “Preparing a private bundle preview” state during the visit; no bundle was created or uploaded.

The preview server rejected the initial `-1` attempt because it blocks mutations globally. To exercise persistence safely, I used an in-process ephemeral server rooted at `.repoos/qa-1179-sandbox`, with an isolated scratch `repoos.toml` and auth disabled. Entering `12` saved `attention.spendAlertUsd = 12`; after a browser reload, the value remained `12`. The scratch config was separate from the worktree’s project config.

The negative-value attempt on the writable harness exposed a UI defect: `-1` silently reverted to the prior value without an error. The same control advertised fractional values (`step="0.01"`) although the server accepts whole dollars only.

## Agents page

Visited Agents, Build Your Team, Scheduled Tasks, Reminders, Detected Coding Agents, Model Playground, Model providers, Budget Controls, and Model routing.

- Agents showed the configured PM, engineer, reviewer, and custom role. Cursor model refresh reported that Cursor Agent authentication is required and retained the saved model list.
- Build Your Team showed the available built-in and custom team entries and their enabled states.
- Scheduled Tasks showed the configured documentation audit and worktree cleanup schedules with their current disabled states and run information. Reminders showed completed entries.
- Detected Coding Agents reported installed CLIs and an unavailable Kiro CLI. Model Playground’s send control required a prompt; no prompt was sent.
- Model providers displayed provider availability/key status without revealing secret values. Model routing showed Shadow mode, OpenRouter as the decision provider, a saved OpenRouter key, and a ready state.
- Budget Controls displayed shared group and local pause information. No budget or pause controls were changed.

## Per-control save, validation, and reload audit

The prior review's coverage finding was correct: the original 115-control matrix covered only schema-backed controls. I reran that Playwright WebKit audit against an in-process auth-less server rooted at `.repoos/qa-1179-control-audit-root`, with a separate scratch `repoos.toml`. It changed each of the 115 visible schema-backed controls on General and Advanced, waited for the API to reflect the value, reloaded, and compared the restored UI value. Result: 115/115 passed (91 General, 24 Advanced): 38 numeric, 28 boolean, 20 select, 15 array, and 14 text controls. Validation was checked per the field's supported rules: invalid numeric bounds and required values showed errors and did not save; role/email/viewport arrays received invalid-value checks; constrained booleans and selects were verified as value-constrained; free-form lists were recorded as having no invalid-entry rule.

I separately audited the hand-rendered General controls that the schema-row inventory does not include: floating agent buttons, glide animations, keyboard navigation, theme selection and favorite, the animation motion/style/size/concurrency controls, and attachment storage provider. Each saved and restored after reload in the scratch browser/config. Attachment storage was returned to the local provider after the round-trip. The existing CTO safe-action checklist was included in the 115-control matrix and its unknown-action validation is covered by `cto-actions-settings.test.ts`.

The remaining Settings tabs were audited control by control in a second scratch browser run:

- **Notifications:** ntfy enable/topic, Telegram enable, spend threshold, sound, and all 24 event toggles saved and restored after reload. The spend threshold rejected `-1` with a visible error and preserved its prior value. Push notifications were not enabled because the browser would request an OS permission; the preference is local to the browser.
- **Security:** voice provider and session duration saved and restored. Enabling auth without a configured login provider showed the provider-required error and remained off after reload. The voice API key stayed blank; no credential was available. User-management, invite, role, and Telegram-account actions were not verified because this auth-less run had no administrator session; invite and Telegram actions also have external effects.
- **Import/Export:** all five export-category toggles were selected, a scratch export was downloaded, an invalid file showed an error, and a valid export was reviewed and applied to the scratch project.
- **Support:** report type selection, required notes, local manual draft creation, and adding/removing a synthetic screenshot worked. A support bundle was created under the scratch root. AI report generation was not triggered because it sends notes to the configured PM agent; the GitHub link and file-browser action were not opened.
- **repoos.toml:** a scratch-only edit saved and survived reload. A malformed TOML edit showed an error; the prior valid scratch content remained available after reload.

These runs exercised the form controls and local workflows without changing the task's project config or contacting an external service. The remaining unverified actions are explicitly listed above; no result is claimed for them.

Validation was exercised for all 38 numeric fields using an invalid value below the declared minimum and checking both unchanged server state and field error feedback. Required text controls were cleared and checked for an error with no save. The `model_routing.roles` and `release.email.to` arrays were tested with an invalid role and invalid email. The viewport-width list was tested with numeric strings, and its API now normalizes them to positive whole pixel widths and rejects empty, non-integer, or non-positive entries. Boolean and select controls cannot accept arbitrary invalid values through their UI; they were recorded as control-constrained. Thirteen free-form lists accept arbitrary text by design, so there is no invalid-entry case to exercise. The CTO safe-action checklist was toggled and verified after reload; its existing route test rejects unknown action IDs.

The pass exposed four persistence/configuration defects and fixes:

- `dev.services`, `preview.targets`, and `shot.targets` describe TOML arrays of tables but were presented as ordinary flat inputs. They now resolve to the TOML editor instead of suggesting a nonfunctional flat save; a table-driven test covers all three keys.
- Pressure-guard ratio fields allowed decimal input but lacked decimal step and upper-bound metadata. The schema and number input now expose the ranges, and the API rejects out-of-range values with an error. Regression coverage checks decimal saves and both bounds for all ratio fields.
- `model_routing.humanStepSticky` saved to TOML but was missing from the browser's flat config payload. It now survives Settings reload; the flattening test covers every model-routing key.
- `uiVerification.viewportWidths` lost numeric entries when the form reloaded because the generic array formatter treated numbers as remote-host records. Numeric pixel widths now display and survive reload. The server normalizes valid numeric text and reports invalid entries instead of silently falling back.

The ntfy “Send test” action was not used because it sends an external message. Browser “Send test” was not used because it may request notification permission. Runner provisioning and other credentialed integrations were not triggered because they depend on external accounts or infrastructure.

## Agents page

Agents, Build Your Team, Scheduled Tasks, Reminders, Detected Coding Agents, Model Playground, Model providers, Budget Controls, and Model routing were visited. A scratch-only custom role was created, observed in Saved state after reload, and removed. Existing saved agent/model state was displayed accurately. Cursor model refresh showed the expected missing-auth state and retained the saved model list. Provider keys remained masked; no external provider request, task scheduling, shared budget membership, or agent assignment was changed. Model Playground's send action requires a prompt, so no prompt was sent.

## Check

The source change fixes a cross-process lock initialization race in `ensureWorktree`: contenders no longer treat a newly created lock directory with no pid file as stale. A deterministic regression covers the directory-creation/pid-write gap. The task-specific Vitest file passed locally, including the separate-process serialization test and the new regression. The scoped RepoOS check is the handoff gate; RepoOS reports its final result in the handoff status.

The scoped gate also exposed environmental coupling in `servers-command.test.ts`: tests that stubbed Tailscale status and SSH still used the default HTTP discovery, so a runner on the real tailnet could return live peer data and break exact assertions. The tests now stub HTTP discovery to `null` when they are specifically checking SSH/fallback behavior. All 15 tests in that file pass locally with the network seam isolated. This does not change production discovery behavior.
## Control inventory audited

### Advanced (24 controls)

`stories.excerptBytes`, `ntfyBaseUrl`, `workDir`, `docsDir`, `skillsDir`, `storiesDir`, `inputsDir`, `schedulesDir`, `remindersDir`, `taskExtensions`, `cacheDir`, `remoteValidation.hangIdleMinutes`, `check.docsOnlySkip`, `check.isolationRuns`, `check.alwaysRun`, `check.fullSuitePaths`, `check.branchArtifactsMaxFileBytes`, `check.checkpointMaxStagedFiles`, `check.checkpointMaxStagedBytes`, `check.buildOutputPatterns`, `check.branchArtifactsAllowlist`, `check.branchArtifactsMaxDecompressBytes`, `check.branchArtifactsMaxScanFiles`, `dev.failureSummary.ai`

### General (91 controls)

`autoReload`, `areas`, `release.notesWhenReady`, `stories.enabled`, `defaultStatus`, `defaultTaskMode`, `defaultAssignee`, `strictBuild`, `updates.check`, `scheduledTasks.enabled`, `maxActiveTasks`, `worktreeWarnThreshold`, `board.doneCollapsedByDefault`, `board.agentPopoverCloseSeconds`, `maxConcurrentAgents`, `editor.command`, `git.tuneForScale`, `heavySlots`, `vitest.maxWorkers`, `localChecks.maxConcurrent`, `playwright.workers`, `playwright.maxConcurrent`, `pressureGuard.enabled`, `pressureGuard.maxLoadPerCpu`, `pressureGuard.minAvailableMemRatio`, `pressureGuard.maxSwapUsedRatio`, `pressureGuard.maxCompressorRatio`, `pressureGuard.maxCompressorBytes`, `pressureGuard.minIdleCpuPercent`, `pressureGuard.activityWindowSec`, `pressureGuard.maxSwapIoBytesPerSec`, `pressureGuard.maxPageoutBytesPerSec`, `pressureGuard.minMemoryFreePercent`, `pressureGuard.maxPsiMemoryAvg10`, `localChecks.queueTimeoutMs`, `localChecks.staleAfterMs`, `localChecks.reclaimGraceMs`, `playwright.queueTimeoutMs`, `remoteValidation.browserCaptureMode`, `model_routing.mode`, `model_routing.provider`, `model_routing.model`, `model_routing.roles`, `model_routing.timeoutMs`, `model_routing.humanStepCheck`, `model_routing.humanStepSticky`, `closeOut.timeoutMs`, `closeOut.gate`, `closeOut.candidate`, `closeOut.installCommand`, `closeOut.postPublishCommand`, `autoEngineeringMode`, `autoEngineering.pmVeto`, `watchdog.phantomDetectMs`, `watchdog.activeWithoutEngineerRecoverMs`, `watchdog.queuedMessageRecoverMs`, `watchdog.engineerCrashFailoverThreshold`, `watchdog.autoPauseOnUsageLimit`, `watchdog.engineerCrashFailoverWindowMs`, `ctoSkipHealthy`, `cto.nudgeIdleMs`, `cto.nudgeCooldownMs`, `skillSuggestions`, `attention.slowRunMultiplier`, `approval.enabled`, `approval.autoApprove.areas`, `approval.autoApprove.types`, `approval.autoApprove.machineryPaths`, `approval.autoApprove.allowP0`, `automation.paused`, `uiVerification.enabled`, `uiVerification.autoRefreshStaleOnce`, `reviewVerification.guardTestCheck`, `reviewVerification.testGlobs`, `review.humanFlagAfterPasses`, `review.freezeAfterPasses`, `review.timeoutMinutes`, `review.failedReportRetries`, `shot.maxAutoShots`, `release.email.enabled`, `release.email.to`, `release.email.when`, `release.email.includePrereleases`, `remoteValidation.offloadBrowserSteps`, `remoteValidation.localFallback`, `tailnetDiscovery`, `remoteValidation.command`, `remoteValidation.requiredTools`, `remoteValidation.healthCheck`, `uiVerification.viewportWidths`, `cto.actions`

Each listed control has an individual save-and-reload result. Validation outcome per control is recorded in the scratch audit during the run; the committed type counts and validation rules above summarize those observations. The separate scratch JSON and scratch TOML were not committed because they contain machine-derived environment state.
