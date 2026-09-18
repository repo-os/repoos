---
id: "0410"
title: Fix mobile horizontal overflow on the landing page and VitePress docs site
type: bug
status: inbox
priority: p2
area: landing
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-18T12:51:45Z"
updated_at: "2026-09-18T12:51:45Z"
---
## Problem

#0409 was meant to fix horizontal overflow on the **landing page** (`landing/`) and the **VitePress docs site** (`user-docs/`), but it was tagged `area: web`, so it fixed the in-app RepoOS UI instead (its diff touched only `src/ui-app` and the smoke harness). The actual landing page and docs site still scroll horizontally on phones, mainly from wide code blocks.

## Acceptance criteria

- [ ] `landing/` has no page-level horizontal overflow at 320–480px widths.
- [ ] The `user-docs/` VitePress site has none either; wide code blocks scroll inside their own container.
- [ ] Desktop layouts unchanged.
- [ ] Verified with the `Landing page` and `Docs site` preview targets from `repoos.toml` (`[[preview.targets]]`), not the default RepoOS UI.

## Notes for AI

- Two separate apps: `landing/` (Vite) and `user-docs/` (VitePress, custom theme under `user-docs/.vitepress`). Fix each in its own tree.
- Do not touch `src/ui-app`; #0409 already handled the in-app UI.

## Activity

- 2026-09-18T12:51:45Z · created · unknown
