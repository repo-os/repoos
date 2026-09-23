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
updated_at: "2026-09-23T02:52:03Z"
review_passes: 1
---
Repair the native RepoOS Hub shipping path after v0.5.51. The tagged macOS workflow built RepoOS Hub.app but then failed because it still searched for RepoOS.app, so no RepoOSHub.dmg was uploaded. Update the workflow to package the renamed bundle, add a deterministic bundle verification, and validate local release build/package commands. Also make the release automation robust against npm registry propagation before dispatching the Homebrew tap update, or otherwise document/retry the release handoff so a published npm version does not leave the tap stale. Do not retag v0.5.51; prepare the pipeline for the next patch release. After code lands, verify the release workflow and tap update externally.

## Activity

- 2026-09-23T02:39:46Z · created · unknown
- 2026-09-23T02:39:52Z · branch
- 2026-09-23T02:39:52Z · status inbox→active
- 2026-09-23T02:41:11Z · status active→review
- 2026-09-23T02:52:03Z · status review→done, release:success
