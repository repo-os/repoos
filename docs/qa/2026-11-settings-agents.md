# Settings and Agents QA — November 2026

## Scope and setup

- Worktree: `feat/qa-pass-settings-and-agents-pages-every-`.
- Started `just serve-noauth 7272` from this worktree and drove the app at `http://127.0.0.1:7272` in Chrome.
- The server identified itself as a preview build on the task branch. Settings showed the banner `Preview servers are read-only`.
- No Settings or Agents values were changed. In particular, no credentials, provider keys, tokens, shared budget groups, schedules, agent assignments, or task state were edited.

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

The review round 4 finding was correct: the prior evidence was representative only. I then ran a Playwright WebKit audit against an in-process auth-less server rooted at `.repoos/qa-1179-control-audit-root`, with a separate scratch `repoos.toml`. The audit loaded General and Advanced independently, inventoried their visible schema-backed controls, changed every control, waited for the API to reflect its value, reloaded, and compared the restored UI value. Result: 115/115 controls passed (91 General, 24 Advanced): 38 numeric, 28 boolean, 20 select, 15 array, and 14 text controls. No changes were made to this worktree's project config or to any external service.

Validation was exercised for all 38 numeric fields using an invalid value below the declared minimum and checking both unchanged server state and field error feedback. Required text controls were cleared and checked for an error with no save. The `model_routing.roles` and `release.email.to` arrays were tested with an invalid role and invalid email. The viewport-width list was tested with numeric strings, and its API now normalizes them to positive whole pixel widths and rejects empty, non-integer, or non-positive entries. Boolean and select controls cannot accept arbitrary invalid values through their UI; they were recorded as control-constrained. Thirteen free-form lists accept arbitrary text by design, so there is no invalid-entry case to exercise. The CTO safe-action checklist was toggled and verified after reload; its existing route test rejects unknown action IDs.

The pass exposed four persistence/configuration defects and fixes:

- `dev.services`, `preview.targets`, and `shot.targets` describe TOML arrays of tables but were presented as ordinary flat inputs. They now resolve to the TOML editor instead of suggesting a nonfunctional flat save; a table-driven test covers all three keys.
- Pressure-guard ratio fields allowed decimal input but lacked decimal step and upper-bound metadata. The schema and number input now expose the ranges, and the API rejects out-of-range values with an error. Regression coverage checks decimal saves and both bounds for all ratio fields.
- `model_routing.humanStepSticky` saved to TOML but was missing from the browser's flat config payload. It now survives Settings reload; the flattening test covers every model-routing key.
- `uiVerification.viewportWidths` lost numeric entries when the form reloaded because the generic array formatter treated numbers as remote-host records. Numeric pixel widths now display and survive reload. The server normalizes valid numeric text and reports invalid entries instead of silently falling back.

The other Settings tabs were visited and their specialized panels observed. Notifications' representative save, validation, and reload evidence remains covered by the scratch threshold flow and its component regression test. Security's auth enable control was not toggled because this harness intentionally runs without auth; voice API keys are write-only and were not entered. Import/Export and Support buttons initiate file or external-data actions rather than persist a setting; no import, report submission, or bundle upload was initiated. The TOML editor was viewed but not modified. The ntfy and browser “Send test” actions, Telegram connection flow, runner provisioning, and other credentialed integrations were not triggered because they send external messages, request permissions, or depend on credentials. These are documented limits rather than claims of successful end-to-end operations.

## Agents page

Agents, Build Your Team, Scheduled Tasks, Reminders, Detected Coding Agents, Model Playground, Model providers, Budget Controls, and Model routing were visited. A scratch-only custom role was created, observed in Saved state after reload, and removed. Existing saved agent/model state was displayed accurately. Cursor model refresh showed the expected missing-auth state and retained the saved model list. Provider keys remained masked; no external provider request, task scheduling, shared budget membership, or agent assignment was changed. Model Playground's send action requires a prompt, so no prompt was sent.

## Check

The final scoped check result will be recorded after source, tests, and this note are complete. The check exercises build, typecheck, changed-path tests, and the UI gate against this task branch.
## Control inventory audited

### Advanced (24 controls)

`stories.excerptBytes`, `ntfyBaseUrl`, `workDir`, `docsDir`, `skillsDir`, `storiesDir`, `inputsDir`, `schedulesDir`, `remindersDir`, `taskExtensions`, `cacheDir`, `remoteValidation.hangIdleMinutes`, `check.docsOnlySkip`, `check.isolationRuns`, `check.alwaysRun`, `check.fullSuitePaths`, `check.branchArtifactsMaxFileBytes`, `check.checkpointMaxStagedFiles`, `check.checkpointMaxStagedBytes`, `check.buildOutputPatterns`, `check.branchArtifactsAllowlist`, `check.branchArtifactsMaxDecompressBytes`, `check.branchArtifactsMaxScanFiles`, `dev.failureSummary.ai`

### General (91 controls)

`autoReload`, `areas`, `release.notesWhenReady`, `stories.enabled`, `defaultStatus`, `defaultTaskMode`, `defaultAssignee`, `strictBuild`, `updates.check`, `scheduledTasks.enabled`, `maxActiveTasks`, `worktreeWarnThreshold`, `board.doneCollapsedByDefault`, `board.agentPopoverCloseSeconds`, `maxConcurrentAgents`, `editor.command`, `git.tuneForScale`, `heavySlots`, `vitest.maxWorkers`, `localChecks.maxConcurrent`, `playwright.workers`, `playwright.maxConcurrent`, `pressureGuard.enabled`, `pressureGuard.maxLoadPerCpu`, `pressureGuard.minAvailableMemRatio`, `pressureGuard.maxSwapUsedRatio`, `pressureGuard.maxCompressorRatio`, `pressureGuard.maxCompressorBytes`, `pressureGuard.minIdleCpuPercent`, `pressureGuard.activityWindowSec`, `pressureGuard.maxSwapIoBytesPerSec`, `pressureGuard.maxPageoutBytesPerSec`, `pressureGuard.minMemoryFreePercent`, `pressureGuard.maxPsiMemoryAvg10`, `localChecks.queueTimeoutMs`, `localChecks.staleAfterMs`, `localChecks.reclaimGraceMs`, `playwright.queueTimeoutMs`, `remoteValidation.browserCaptureMode`, `model_routing.mode`, `model_routing.provider`, `model_routing.model`, `model_routing.roles`, `model_routing.timeoutMs`, `model_routing.humanStepCheck`, `model_routing.humanStepSticky`, `closeOut.timeoutMs`, `closeOut.gate`, `closeOut.candidate`, `closeOut.installCommand`, `closeOut.postPublishCommand`, `autoEngineeringMode`, `autoEngineering.pmVeto`, `watchdog.phantomDetectMs`, `watchdog.activeWithoutEngineerRecoverMs`, `watchdog.queuedMessageRecoverMs`, `watchdog.engineerCrashFailoverThreshold`, `watchdog.autoPauseOnUsageLimit`, `watchdog.engineerCrashFailoverWindowMs`, `ctoSkipHealthy`, `cto.nudgeIdleMs`, `cto.nudgeCooldownMs`, `skillSuggestions`, `attention.slowRunMultiplier`, `approval.enabled`, `approval.autoApprove.areas`, `approval.autoApprove.types`, `approval.autoApprove.machineryPaths`, `approval.autoApprove.allowP0`, `automation.paused`, `uiVerification.enabled`, `uiVerification.autoRefreshStaleOnce`, `reviewVerification.guardTestCheck`, `reviewVerification.testGlobs`, `review.humanFlagAfterPasses`, `review.freezeAfterPasses`, `review.timeoutMinutes`, `review.failedReportRetries`, `shot.maxAutoShots`, `release.email.enabled`, `release.email.to`, `release.email.when`, `release.email.includePrereleases`, `remoteValidation.offloadBrowserSteps`, `remoteValidation.localFallback`, `tailnetDiscovery`, `remoteValidation.command`, `remoteValidation.requiredTools`, `remoteValidation.healthCheck`, `uiVerification.viewportWidths`, `cto.actions`

Each listed control has an individual save-and-reload result. Validation outcome per control is recorded in the scratch audit during the run; the committed type counts and validation rules above summarize those observations. The separate scratch JSON and scratch TOML were not committed because they contain machine-derived environment state.
