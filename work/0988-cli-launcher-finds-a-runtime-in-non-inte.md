---
updated_at: "2026-10-31T11:05:37Z"
review_passes: 1
id: "0988"
title: CLI launcher finds a runtime in non-interactive shells
type: bug
status: review
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/cli-launcher-finds-a-runtime-in-non-inte
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-31T08:30:56Z"
---
## Problem

The curl-installed `repoos` launcher runs `exec node` and fails with "node: not found" in non-interactive SSH shells when node comes from mise or nvm (seen on v0.5.60). Outside agents (and CI) run `ssh host repoos --version` and get a hard failure with no hint.

## Desired UX

The launcher finds a usable runtime without an interactive shell, and when it cannot it says exactly what to do.

## Acceptance criteria

- [ ] `ssh host repoos --version` works in a non-interactive shell when the runtime comes from mise, nvm or a Bun install, without the user editing their rc files.
- [ ] The launcher checks the common locations (Bun first per AGENTS.md, then mise, nvm and system node) or uses the bundled Bun, and the order is documented in a comment.
- [ ] When no runtime is found it prints an actionable error naming the places it looked and how to fix it, and exits non-zero.
- [ ] The failure and its fix are in the Troubleshooting docs page.
- [ ] A test covers runtime discovery with a stripped PATH.

## Notes for AI

Find the launcher in the install scripts and the package bin before changing anything. Bun is the default runtime here; Node is only the fallback (see AGENTS.md Runtime). Do not add a runtime dependency. Verify every command you document against `repoos --help`.

## Activity

- 2026-10-31T08:30:56Z · created · njachowski@gmail.com
- 2026-10-31T08:31:18Z · cli_override, model_override
- 2026-10-31T08:31:22Z · status inbox→ready
- 2026-10-31T10:37:06Z · status ready→active, branch
- 2026-10-31T11:04:43Z · status active→review
- 2026-10-31T11:04:43Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-10-31T11:05:37Z · note: review pass 1: needs some work

