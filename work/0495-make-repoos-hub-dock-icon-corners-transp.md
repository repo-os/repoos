---
id: "0495"
title: Make RepoOS Hub Dock icon corners transparent
type: bug
status: inbox
priority: p1
area: macos
assigned_to: ai
created_by: ""
branch: fix/hub-dock-icon-transparency
created_at: "2026-09-23T04:57:55Z"
updated_at: "2026-09-23T04:58:05Z"
---
Fix the RepoOS Hub Dock icon after the branded icon rollout. The generated PNG paints the full square canvas with the dark interior color before drawing the rounded border, leaving opaque dark corners outside the intended colored rounded-square icon in the Dock. Generate icons with transparent pixels outside the outer rounded shape, preserve the dark inner rounded panel and colored border, regenerate AppIcon and DockIcon assets, and add a regression check for transparent corners.

## Activity

- 2026-09-23T04:57:55Z · created · unknown
- 2026-09-23T04:58:05Z · branch
