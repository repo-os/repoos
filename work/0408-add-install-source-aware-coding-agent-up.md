---
id: "0408"
title: Add install-source-aware coding-agent update checks
type: feature
status: ready
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: ""
review_model_override: opencode-go/hy3
created_at: "2026-09-18T11:16:48Z"
updated_at: "2026-09-18T11:17:42Z"
---
## Problem

RepoOS shows the installed version of each detected coding-agent CLI but cannot tell a user whether that installation is current. An outdated Codex CLI recently caused a task failure, so users need a clear way to discover stable upgrades before they retry work.

## Outcome

Add an explicit Check for updates action to Detected Coding Agents. It checks supported public release sources on demand, caches the result, and shows a clear status per installed agent: up to date, update available, unavailable, or unable to check. RepoOS must never install or update anything itself.

## Requirements

- Preserve the existing local PATH and version detection behavior.
- Do not make network requests during app startup or ordinary agent detection. The user must initiate the check.
- Resolve the installation channel when it can be established from the binary path or a safe local inspection. Do not assume every CLI is installed from npm.
- Support reliable source adapters such as npm latest tags, Homebrew formula/cask metadata, and vendor/GitHub release APIs where an official stable endpoint exists.
- When the installation channel or upstream version cannot be verified, show Check manually rather than a misleading comparison.
- Normalize and compare ordinary semantic versions safely. Do not claim an ordering for opaque or date-style vendor versions unless that source defines one.
- Cache results with a visible checked-at time and a modest TTL; allow the user to refresh manually.
- Offer a copyable update command only when RepoOS knows the matching installation channel. Never run it automatically.
- Keep failures fail-soft and per-agent: a blocked registry, timeout, or malformed response must not break the detected-agent list.
- Make outbound behavior and cache semantics understandable in the UI/docs.

## UX

- Add a Check for updates button near the detected-agent heading, with a loading state.
- A row can show e.g. Up to date, Update available: 0.155.0 -> 0.156.0, Check manually, or Could not check.
- Keep the installed version and RepoOS Driver/Detected only badges intact.
- Update available should be noticeable but not treated as an error; clicking it reveals source, checked time, and a copyable safe update hint if available.

## Verification

- Unit-test source selection, response parsing, cache expiry, version comparison, unsupported/opaque versions, and all fail-soft paths.
- Cover npm, Homebrew, and one release-API adapter with fixtures; no live network in tests.
- Add route/UI tests for explicit fetch, loading, cached results, errors, and copy behavior.
- Verify no update check occurs during normal detection or page load.
- Run the focused tests plus repoos check.

## Activity

- 2026-09-18T11:16:48Z · created · unknown
- 2026-09-18T11:17:40Z · review_model_override
- 2026-09-18T11:17:42Z · status inbox→ready
