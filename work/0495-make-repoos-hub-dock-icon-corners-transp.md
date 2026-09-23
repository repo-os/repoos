---
updated_at: "2026-09-23T05:43:30Z"
review_passes: 2
id: "0495"
title: Make RepoOS Hub Dock icon corners transparent
type: bug
status: review
priority: p1
area: macos
assigned_to: ai
created_by: ""
branch: fix/hub-dock-icon-transparency
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-09-23T04:57:55Z"
---
Fix the RepoOS Hub Dock icon after the branded icon rollout. The generated PNG paints the full square canvas with the dark interior color before drawing the rounded border, leaving opaque dark corners outside the intended colored rounded-square icon in the Dock. Generate icons with transparent pixels outside the outer rounded shape, preserve the dark inner rounded panel and colored border, regenerate AppIcon and DockIcon assets, and add a regression check for transparent corners.

## Activity

- 2026-09-23T04:57:55Z · created · unknown
- 2026-09-23T04:58:05Z · branch
- 2026-09-23T04:58:06Z · status inbox→active
- 2026-09-23T04:58:57Z · status active→review
- 2026-09-23T05:14:57Z · needs_input
- 2026-09-23T05:38:49Z · review_cli_override, review_model_override
- 2026-09-23T05:38:51Z · review_model_override
- 2026-09-23T05:39:37Z · needs_input
- 2026-09-23T05:40:13Z · status review→active
- 2026-09-23T05:42:48Z · status active→review

