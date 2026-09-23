---
updated_at: "2026-09-23T04:43:10Z"
review_passes: 1
id: "0494"
title: Fix just macos-run after RepoOS Hub app rename
type: bug
status: review
priority: p1
area: macos
assigned_to: ai
created_by: ""
branch: fix/macos-run-hub-app-path
created_at: "2026-09-23T04:41:45Z"
---
Update the just macos-run recipe after the native app product rename. The Debug build now produces RepoOS Hub.app, but the recipe still opens RepoOS.app and fails after a successful build. Point it at the renamed bundle, preserve macos-build behavior, and verify the recipe opens the built app path. Do not alter unrelated Mac release workflow or app behavior.

## Activity

- 2026-09-23T04:41:45Z · created · unknown
- 2026-09-23T04:41:56Z · branch
- 2026-09-23T04:41:57Z · status inbox→active
- 2026-09-23T04:42:39Z · status active→review

