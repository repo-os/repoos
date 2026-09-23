---
id: "0489"
title: Repair RepoOS Hub release and Homebrew publishing after rename
type: bug
status: done
priority: p0
area: macos
assigned_to: ai
created_by: ""
branch: feat/repair-hub-release-publishing
created_at: "2026-09-23T02:39:46Z"
updated_at: "2026-09-23T04:53:23Z"
review_passes: 1
---
Repair the native RepoOS Hub shipping path after v0.5.51. The tagged macOS workflow built RepoOS Hub.app but then failed because it still searched for RepoOS.app, so no RepoOSHub.dmg was uploaded. Update the workflow to package the renamed bundle, add a deterministic bundle verification, and validate local release build/package commands. Make the release automation robust against npm registry propagation before dispatching the Homebrew tap update. Add durable internal release documentation for future agents: the RepoOS Hub app and DMG artifact names, tag-triggered pipeline, ad-hoc signing/notarization status, npm-to-Homebrew handoff, verification, and the docs/landing publication sequence. Do not retag v0.5.51; prepare the pipeline for the next patch release. After code lands, verify the release workflow and tap update externally.

## Activity

- 2026-09-23T02:39:46Z · created · unknown
- 2026-09-23T02:39:52Z · branch
- 2026-09-23T02:39:52Z · status inbox→active
- 2026-09-23T02:41:11Z · status active→review
- 2026-09-23T02:52:03Z · status review→done, release:success
- 2026-09-23T03:48:33Z · status done→active
- 2026-09-23T03:48:33Z · body
- 2026-09-23T03:54:30Z · watchdog: auto-surfaced stuck task · status active→ready · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-09-23T04:53:23Z · status ready→done
