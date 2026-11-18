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

The representative save/reload path was verified in the isolated writable harness. The full inventory across Settings and Agents was visited, but not every field’s persistence and validation was individually exercised. The observed Cursor refresh error was an environment authentication condition with a saved-list fallback, rather than evidence of incorrect persisted state. The browser access host was unavailable during the follow-up rebuild, so the new inline message was verified in the component regression test, not in a second browser session. No credentials, external provider keys, schedules, agent assignments, shared budgets, or task state were changed.

## Check

`bun run test -- settings-save-only-changed` passed (5 tests). `bun run build:ui` passed. `REPOOS_CHECK_CHANGED=main repoos check` passed on the final source and test changes. Remote validation passed the build, 218 scoped tests, and browser gate; local format, lint, build, contrast, and UI smoke checks passed.
