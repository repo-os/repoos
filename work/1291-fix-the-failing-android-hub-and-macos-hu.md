---
id: "1291"
title: Fix the failing Android Hub and macOS Hub GitHub workflows
type: bug
status: active
priority: p2
area: [macos, mobile]
assigned_to: ai
created_by: t@t
branch: feat/fix-the-failing-android-hub-and-macos-hu
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-26T03:56:34Z"
updated_at: "2026-11-26T03:56:41Z"
---
## Problem

The Android Hub, Publish Hub Android dev build and macOS Hub workflows have failed on recent releases (including v0.5.93 and v0.5.94), so releases ship without the Hub apps.

1. Android (`android-hub.yml`, `publish-hub-dev.yml`): the `android-actions/setup-android@v3` step fails in `sdkmanager` with `Warning: Failed to find package 'tools'`, exit code 1. The action installs `tools` by default (confirm in the action's docs).
2. macOS (`macos-hub.yml`): GitHub rejects the file ("workflow file issue", 0s runs). `actionlint` 1.7.12 reports `context "runner" is not allowed here` at lines 35, 36 and 65: job-level `env` uses `${{ runner.temp }}`. The last successful run seen was on tag v0.5.82.

## Desired UX

All three workflows get past setup and build on GitHub, with the same release outputs they were designed to produce.

## Acceptance criteria

- Every `setup-android` step asks only for packages that exist, and later steps still get the SDK packages they need (platform 36, build tools).
- `macos-hub.yml` sets the temp-dir variables where the `runner` context is allowed (for example a first step writing to `$GITHUB_ENV`), and every later use still resolves, including the release job.
- `actionlint` reports no expression errors for the files in `.github/workflows/`. Also check the SC2193 warning it reports in `android-hub.yml` and `macos-hub.yml` and fix it if the comparison really can never match.
- A test in the normal suite fails if a job-level `env` uses the `runner` context again, or a `setup-android` step relies on the default package list.
- Docs touched by the change are updated.

## Notes for AI

- Do not trigger releases, push tags or publish anything from the task. Confirming the runs on GitHub happens after landing.
- The macOS file has changed a lot since its last green run, so later build steps may fail once it parses; fix what can be proven from the repo and list anything unverified in the report.
- Do not edit `repoos.toml`.

## Activity

- 2026-11-26T03:56:34Z · created · t@t
- 2026-11-26T03:56:39Z · status inbox→ready
- 2026-11-26T03:56:40Z · cli_override, model_override
- 2026-11-26T03:56:41Z · status ready→active, branch
