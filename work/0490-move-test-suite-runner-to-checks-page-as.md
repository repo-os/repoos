---
id: "0490"
title: "Move test suite runner to Checks page as a tab, with local and remote options"
type: feature
status: review
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/move-test-suite-runner-to-checks-page-as
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-09-23T03:24:20Z"
updated_at: "2026-09-23T04:34:42Z"
review_passes: 1
---
The 'Test Suite' section at the bottom of the Control page should move to the Checks page as a dedicated tab.

## What to build

- Add a **Test Suite** tab to the Checks page (`ChecksView.vue`)
- Show a **Run locally** button — runs `bun run test` on this machine, streams output (same as today's control page behavior)
- Show a **Run on remote runner** button — only visible when `remoteValidation` is enabled in `repoos.toml`; SSHes into the configured runner and streams output back
- Remove the test suite section from the Control page once it lives on Checks

## Why

The Checks page is the natural home for anything about running verification. The current placement at the bottom of Control is hard to find. Adding a remote option lets developers quickly verify "does this pass on the remote runner?" without needing to create and MTD a task.

## Activity

- 2026-09-23T03:24:20Z · created · unknown
- 2026-09-23T03:26:02Z · status inbox→ready
- 2026-09-23T03:32:39Z · status ready→active, branch
- 2026-09-23T03:44:01Z · status active→review
- 2026-09-23T04:34:40Z · review_cli_override, review_model_override
- 2026-09-23T04:34:42Z · review_model_override
