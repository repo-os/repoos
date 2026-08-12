---
id: "0129"
title: Discover available GitHub Copilot CLI models
type: feature
status: inbox
priority: p2
area: agent
assigned_to: ai
created_by: ""
branch: feat/discover-available-github-copilot-cli-mo
created_at: "2026-08-12T07:45:00Z"
updated_at: "2026-08-12T08:41:38Z"
---
## Problem

The Agents page currently offers only Copilot's `default` model because RepoOS
does not yet have a verified, machine-readable way to discover the models
available to the installed GitHub Copilot CLI and authenticated account.

## Desired UX

When Copilot CLI can provide a reliable model catalog, the Agents page lists
the account-compatible models alongside `default`. When it cannot, the UI
explains that discovery is unavailable and continues to allow explicit model
compatibility tests without presenting an invented static list.

## Acceptance criteria

- [ ] Verify whether the installed GitHub Copilot CLI exposes a stable,
  account-aware model-list command or SDK/API surface.
- [ ] Add a bounded, fail-soft model source adapter if a supported discovery
  surface exists.
- [ ] Show the discovered Copilot models in the Agents page and per-task model
  picker, retaining `default` as the safe fallback.
- [ ] Keep explicit per-model compatibility testing available when live
  discovery is unavailable or fails.
- [ ] Add fake-binary coverage for successful, missing, malformed, and
  timed-out model discovery.
- [ ] Document the supported Copilot versions, authentication assumptions, and
  fallback behavior.

## Notes for AI

- Do not scrape interactive terminal UI or hard-code provider model names.
- Treat live discovery as unsupported unless it is verified against the
  installed Copilot CLI's documented noninteractive interface.
- Preserve the existing `default` fallback and avoid breaking configured model
  ids.

## Activity

- 2026-08-12T07:45:00Z · created · unknown
- 2026-08-12T07:46:53Z · repaired malformed Copilot JSONL task output
- 2026-08-12T07:49:12Z · status inbox→ready
- 2026-08-12T07:50:00Z · status ready→active, branch
- 2026-08-12T08:41:38Z · status active→inbox
