---
id: 1024
title: "Release pipeline: rebuild docs, changelog, llms files and release notes on every release"
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: the agent process exited with an error — open the task to see the full output
priority: p1
area: [core, docs]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/release-pipeline-rebuild-docs-changelog-
created_at: "2026-11-04T06:45:38Z"
updated_at: "2026-11-04T13:34:29Z"
dev_error_count: 2
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-11-04T13:27:45.709Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-11-04T13:34:29.914Z\",\"kind\":\"dev-error\"}]"
---
## Problem
v0.5.75 QA found the release leaves public surfaces stale: docs.repoos.org/changelog stops at v0.5.74, changelog.md "Recent releases" is empty, llms-full.txt is stale (docs built 11:07 SGT, release published 11:49 SGT). GitHub release notes for v0.5.73–75 are empty apart from a "Full Changelog" link. No current version/date is shown on repoos.org, llms.txt or docs. Guessable agent URLs 404: repoos.org `/llms-full.txt`, `/AGENTS.md`, `/.well-known/llms.txt`, `/docs`; repo `CHANGELOG.md`.

## Desired UX
- Docs site (changelog, llms.txt, llms-full.txt) is rebuilt and published as part of the release pipeline, after the version bump, so it always reflects the latest release.
- GitHub release notes contain the real changelog entry.
- repoos.org, llms.txt and docs show the current version and release date.
- The guessable agent URLs above resolve (redirect or serve) or are deliberately documented as absent.

## Acceptance criteria
- [ai] Release pipeline rebuilds docs after the version bump; a test or dry-run proves changelog and llms files contain the new version.
- [ai] GitHub release body is populated from the changelog entry.
- [ai] Version + release date appear on the landing page, llms.txt and docs.
- [ai] The listed 404 URLs are resolved or consciously dropped, with a note.

## Notes for AI
Source: external QA report on v0.5.75 (items 2, 6, 19). Left out: SEO polish (sitemap, OpenGraph, license/topics) — separate. Product description wording (item 7) is pending a human decision; do not touch it.

## Activity

- 2026-11-04T06:45:38Z · created · njachowski@gmail.com
- 2026-11-04T12:58:45Z · status inbox→ready
- 2026-11-04T12:58:51Z · status ready→active, branch
- 2026-11-04T13:21:11Z · message_queued at 2026-11-04T13:21:11.783Z
- 2026-11-04T13:21:11Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T13:26:11Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T13:27:45Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T13:27:45Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T13:27:49Z · needs_input
- 2026-11-04T13:27:49Z · message_delivered: 1 message(s)
- 2026-11-04T13:34:29Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T13:34:29Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
