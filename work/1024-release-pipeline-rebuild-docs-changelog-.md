---
id: 1024
title: "Release pipeline: rebuild docs, changelog, llms files and release notes on every release"
type: bug
status: active
priority: p1
area: [core, docs]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/release-pipeline-rebuild-docs-changelog-
model_override: opencode-go/muse-spark-1.3-contributor
created_at: "2026-11-04T06:45:38Z"
updated_at: "2026-11-04T15:13:59Z"
dev_error_count: 10
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/muse-spark-1.3-contributor\",\"at\":\"2026-11-04T14:21:53.776Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/muse-spark-1.3-contributor\",\"at\":\"2026-11-04T14:22:52.112Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/muse-spark-1.3-contributor\",\"at\":\"2026-11-04T14:30:59.688Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/muse-spark-1.3-contributor\",\"at\":\"2026-11-04T14:45:49.309Z\",\"kind\":\"dev-error\"}]"
engineer_failover: "{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\"}"
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

## Shots
```json
[
{
"label": "Docs homepage carries the current release version and date",
"target": "Docs site",
"route": "/",
"highlight": ".release-line"
},
{
"label": "Docs changelog shows the current version pill and release entries",
"target": "Docs site",
"route": "/changelog",
"highlight": ".release-current"
},
{
"label": "repoos.org stats show the current version with its released date",
"target": "Landing page",
"route": "/"
}
]
```

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
- 2026-11-04T13:34:46Z · needs_input
- 2026-11-04T13:35:16Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T13:35:16Z · engineer crash recovery: switched opencode + opencode-go/deepseek-v4.1-flash → opencode + opencode-go/glm-5.3-flash after 3/3 crashes in 30m · the agent process exited with an error — open the task to see the full output
- 2026-11-04T13:35:46Z · needs_input
- 2026-11-04T13:47:43Z · body
- 2026-11-04T13:47:54Z · body
- 2026-11-04T13:48:09Z · body
- 2026-11-04T13:48:11Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 1s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-04T13:48:39Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T13:48:42Z · needs_input
- 2026-11-04T13:48:43Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 33s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-04T13:49:23Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (2/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T13:49:26Z · needs_input
- 2026-11-04T13:49:28Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 1m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-04T13:51:30Z · body
- 2026-11-04T13:51:58Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-04T13:52:13Z · watchdog: check wait escalated · waiting: waiting for a local check slot (3 ahead, position 4); waiting behind #1024 check (pid 46692, alive), #1024 check (pid 18417, alive), #1024 check (pid 22609, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 5s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-04T13:52:28Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-04T13:52:58Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 5s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-04T13:54:58Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-04T13:59:42Z · body
- 2026-11-04T14:00:53Z · body
- 2026-11-04T14:01:01Z · watchdog: check wait escalated · waiting: waiting for a local check slot (3 ahead, position 4); waiting behind #1030 check (pid 50649, alive), #1024 check (pid 70210, alive), #1024 check (pid 57029, wedged); slot holder has made no progress for 30 minutes (no heartbeat) for 6s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-04T14:08:02Z · engineer crash recovery: surfaced instead of switching — RepoOS already switched this task once (opencode + opencode-go/glm-5.3-flash); it will not chain another automatic switch (3/3 crashes in 30m)
- 2026-11-04T14:09:01Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-04T14:09:15Z · body
- 2026-11-04T14:09:37Z · cli_override, model_override
- 2026-11-04T14:10:36Z · body
- 2026-11-04T14:10:39Z · body
- 2026-11-04T14:20:02Z · body
- 2026-11-04T14:21:53Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T14:21:53Z · engineer crash recovery: resuming opencode + opencode-go/muse-spark-1.3-contributor (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T14:21:57Z · needs_input
- 2026-11-04T14:22:52Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T14:22:52Z · engineer crash recovery: resuming opencode + opencode-go/muse-spark-1.3-contributor (2/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T14:23:14Z · needs_input
- 2026-11-04T14:24:59Z · body
- 2026-11-04T14:27:05Z · body
- 2026-11-04T14:30:19Z · body
- 2026-11-04T14:30:20Z · body
- 2026-11-04T14:30:59Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T14:30:59Z · engineer crash recovery: surfaced instead of switching — a human-set task override (opencode + opencode-go/muse-spark-1.3-contributor) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-11-04T14:34:32Z · needs_input
- 2026-11-04T14:45:49Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T14:45:49Z · engineer crash recovery: surfaced instead of switching — a human-set task override (opencode + opencode-go/muse-spark-1.3-contributor) is pinned, so RepoOS did not replace it (4/3 crashes in 30m)
- 2026-11-04T14:48:13Z · body
- 2026-11-04T14:48:27Z · body
- 2026-11-04T14:58:14Z · body
- 2026-11-04T15:00:44Z · body
- 2026-11-04T15:13:34Z · watchdog: restarting engineer after 13m with no live process
- 2026-11-04T15:13:59Z · body
