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

## Findings and limits

Fixed the spend-alert validation defect. The field now reports a clear inline error for negative values and fractional dollar amounts, marks the input invalid for assistive technology, and advertises a whole-number step. A regression test verifies invalid values do not save, the error clears for a valid value, and a valid whole amount is sent to the config store.

The initial representative save/reload path was verified in the isolated writable harness. After review round 3, I continued against a second isolated scratch root, `.repoos/qa-1179-audit-sandbox`, with its own `repoos.toml`; no project config was touched. In Settings → Notifications, keyboard-edited the spend threshold to `14`, waited for “Saved — applied live,” reloaded the page, and observed `14` still present. The same input's accessible stepper clamps a typed `-1` to its minimum on blur in this browser; invalid negative and fractional input error messaging, no-save behavior, and valid whole-dollar save are covered by `settings-save-only-changed.test.ts` (including `aria-invalid` and `aria-describedby`). A direct accessibility `setValue` call did not edit the stepper; keyboard input was required.

In Agents → Agents, added a scratch-only custom role named `qa audit scratch`, observed the Saved state, reloaded, and confirmed the role remained. Removed it afterward and observed the Saved state again. This exercised both create and delete persistence without touching the repository's configured agents. The earlier inventory visit covered every Settings tab (General, Notifications, Security, Advanced, Import/Export, Support, repoos.toml) and every Agents tab (Agents, Build Your Team, Scheduled Tasks, Reminders, Detected Coding Agents, Model Playground, Model providers, Budget Controls, Model routing). General's Areas field also survived a prior reload.

This establishes working examples of Settings text, numeric-stepper, and Agents collection save/reload paths, and field-specific validation for the only confirmed validation defect. It does **not** establish per-field save, validation, and reload for every editable control; the Settings page exposes many controls and the Agents page includes controls that call external providers, request OS permissions, change automation policy, or write OS services. Those actions were not triggered in the scratch run. Per-control behavior beyond the paths above remains unverified and must not be inferred from the shared autosave path. The observed Cursor refresh error was an environment authentication condition with a saved-list fallback, not evidence of incorrect persisted state. No credentials, external provider keys, schedules, agent assignments, shared budgets, or task state were changed.

## Check

`bun run test -- settings-save-only-changed` passed (5 tests). `bun run build:ui` passed. `REPOOS_CHECK_CHANGED=main repoos check` passed on the final source and test changes. Remote validation passed the build, 218 scoped tests, and browser gate; local format, lint, build, contrast, and UI smoke checks passed.
