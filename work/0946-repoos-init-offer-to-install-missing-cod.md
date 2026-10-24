---
id: "0946"
title: "repoos init: offer to install missing coding agents (checkbox list)"
type: feature
status: active
priority: p2
area: [core, docs]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-init-offer-to-install-missing-cod
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-24T02:32:41Z"
updated_at: "2026-10-24T04:07:06Z"
---
## Problem

A new user's first failure is often "no coding agent works". `repoos init` never checks which agents are installed. The Agents page already detects and shows install hints, but init does not use any of it.

## Desired UX

During interactive `repoos init` (TTY only; non-interactive init stays fully non-blocking and unchanged), after the existing steps:

1. One question, default No: "Install coding agents now? (y/N)". Skipping must be fast and silent.
2. If yes, print a table from the same detection the Agents page uses: installed agents first (✓ headless-capable, ✓ signed in), then the not-installed ones as a checkbox list (arrow keys + space, nothing pre-checked).
3. For each checked agent show the exact install command (its `installHint`) and ask for confirmation before running it. A failed install prints the manual command and init continues (never fails init).
4. Finish with "still needs sign-in:" listing each installed-but-not-signed-in agent with its sign-in hint. Init never tries to log in for the user.

## Acceptance criteria

- [ ] Interactive init asks the single y/N question; default No does nothing else.
- [ ] The agent list and install/sign-in hints come from ONE shared source (`src/core/detect.ts` `installHint`/sign-in hint), used by both init and the Agents page. No second copy of the hints.
- [ ] Checkbox UI: installed agents listed separately (read-only), missing ones selectable, nothing pre-checked; works with keyboard only.
- [ ] Each install command is shown and confirmed before it runs; stdout/stderr summarized; failure prints the manual command and init still succeeds.
- [ ] Non-TTY / CI / `--yes`-style init never prompts and never installs.
- [ ] Zero runtime dependencies: build the checkbox prompt with node readline/raw mode, no new package.
- [ ] Tests with fake detection and a fake installer (no real `npm i -g`): skip path, select-and-confirm path, failed-install path, non-TTY path.
- [ ] Docs: `user-docs` (init / getting started) describes the step; check nothing in AGENTS.md or docs contradicts it.

## Notes for AI

- Do not run real global installs in tests. Mention in docs that `npm i -g` may need a different npm prefix or sudo.
- Do not duplicate `runners check/setup` (that is for remote machines where init is never run); share the install-hint table only.
- Reuse the interactive helpers in `src/commands/init.ts` (see the existing `isTTY` checks around the prompt helpers).

## Activity

- 2026-10-24T02:32:41Z · created · njachowski@gmail.com
- 2026-10-24T03:48:30Z · status inbox→ready
- 2026-10-24T03:48:36Z · cli_override, model_override
- 2026-10-24T03:48:36Z · status ready→active, branch
- 2026-10-24T04:02:06Z · message_queued at 2026-10-24T04:02:06.604Z
- 2026-10-24T04:02:06Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-24T04:07:06Z · CTO nudge: held — an undelivered message is already queued
