# Settings and Agents QA — November 2026

## Scope and setup

- Worktree: `feat/qa-pass-settings-and-agents-pages-every-`.
- Started `just serve-noauth 7272` from this worktree and drove the app at `http://127.0.0.1:7272` in Chrome.
- The server identified itself as a preview build on the task branch. Settings showed the banner `Preview servers are read-only`.
- No Settings or Agents values were changed. In particular, no credentials, provider keys, tokens, shared budget groups, schedules, agent assignments, or task state were edited.

## Settings page

Visited all Settings tabs: General, Notifications, Security, Advanced, Import/Export, Support, and `repoos.toml`. General’s visible sections included Themes, Activity animation, Performance, General, Model routing, Close-out, Automation & approval, Screenshots, Attachments, Background service, Publishing, Release emails, Remote validation, and Board.

The UI exposed the expected controls and context descriptions. Security showed authentication disabled in this auth-less instance. Import/Export exposed export controls. The raw TOML tab was viewed but not edited. Support’s private diagnostics preview remained in its “Preparing a private bundle preview” state during the visit; no bundle was created or uploaded.

Attempted to exercise negative validation on Notifications’ Spend alert threshold by entering `-1`. The preview server rejected mutation requests globally; the UI retained `0` and displayed the read-only preview banner. Therefore the validation result and persistence across reload could not be established in this environment. No config file was changed.

## Agents page

Visited Agents, Build Your Team, Scheduled Tasks, Reminders, Detected Coding Agents, Model Playground, Model providers, Budget Controls, and Model routing.

- Agents showed the configured PM, engineer, reviewer, and custom role. Cursor model refresh reported that Cursor Agent authentication is required and retained the saved model list.
- Build Your Team showed the available built-in and custom team entries and their enabled states.
- Scheduled Tasks showed the configured documentation audit and worktree cleanup schedules with their current disabled states and run information. Reminders showed completed entries.
- Detected Coding Agents reported installed CLIs and an unavailable Kiro CLI. Model Playground’s send control required a prompt; no prompt was sent.
- Model providers displayed provider availability/key status without revealing secret values. Model routing showed Shadow mode, OpenRouter as the decision provider, a saved OpenRouter key, and a ready state.
- Budget Controls displayed shared group and local pause information. No budget or pause controls were changed.

## Findings and limits

No confirmed product defect was reproduced. The observed Cursor refresh error was an environment authentication condition with a saved-list fallback, rather than evidence of incorrect persisted state. The task’s core save/validation/reload acceptance criterion remains unverified: `just serve-noauth` runs the server as a read-only preview child, and its router blocks all non-GET/HEAD requests. Testing writes would require an explicitly isolated writable server/config setup; bypassing the preview guard or pointing a server at the real project config would be unsafe. This pass made no source-code changes and added no bug-specific tests.

## Check

`REPOOS_CHECK_CHANGED=main repoos check` passed. Remote validation completed the build, scoped tests, and browser gate; local format, lint, build, and UI smoke steps passed. No changed paths existed relative to `main` at the time of that first run.
