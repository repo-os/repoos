---
last_close_out_gate_ms: 279520
last_close_out_gate_at: "2026-10-21T06:03:38.801Z"
id: "0862"
title: "Docs site: use the landing page's RepoOS logo (theme-aware, no extra border)"
type: chore
status: review
priority: p2
area: [docs, landing]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/docs-site-use-the-landing-page-s-repoos-
cli_override: cursor
model_override: grok-4.7-low
created_at: "2026-10-20T06:23:23Z"
updated_at: "2026-10-21T06:03:38Z"
review_passes: 1
last_check_failure: "repoos check at 2026-10-21T05:03:23.727Z: repoos check failed: vite v8.2.0 building client environment for production..."
dev_error_count: 4
engineer_failover: "{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\"}"
---
## Problem
The docs site (VitePress, `user-docs/`) and the landing page (`landing/`) show the RepoOS logo differently. In the attached screenshots (in order: 1 landing Gruvbox dark, 2 landing Gruvbox light, 3 landing Classic light, 4 docs site, 5 landing Classic dark) the landing logo is a plain hexagon with the three-bar mark that **changes with the theme**: its stroke gradient and bar colours follow the theme tokens in Gruvbox, Classic, light and dark. The docs site logo (4) sits inside an **extra rounded-square border/box** and stays one fixed colour set whatever theme or appearance is selected.

Cause: the landing page draws the logo as an inline SVG component (`landing/src/components/SiteLogo.vue`, gradient from `var(--cyan)` to `var(--violet)`, bars in `var(--violet)`), so it inherits the active theme. The docs site passes a static image to the VitePress theme (`logo: "/favicon.svg"` in `user-docs/.vitepress/config.mts`, file `user-docs/public/favicon.svg`), which is a standalone square icon with its own background and fixed colours, so it cannot follow the docs theme picker (`user-docs/.vitepress/theme/ThemePicker.vue`, `theme-resolve.ts`, `custom.css`).

## Desired UX
- The docs site header shows the same logo as the landing page: the borderless hexagon with the three bars, same proportions and spacing relative to the "RepoOS" wordmark, no surrounding rounded box.
- The logo colours follow the docs theme and appearance (Classic and Gruvbox, light and dark, and any other theme the docs picker offers), using the docs site's own theme tokens, so it matches what the landing page shows for the same theme.
- The browser-tab favicon stays as it is (the square app icon); only the in-page header logo changes. Share the SVG geometry between landing and docs (a single source, for example a small shared SVG snippet or the same path data) so the two cannot drift again.
- Works on the home hero, doc pages, mobile menu and the 404 page, in both appearances, with no flash of the wrong colours on load (the docs theme-boot already sets the theme before paint).

## Acceptance criteria
- The docs header logo is an inline, token-coloured SVG (via a VitePress layout slot such as `nav-bar-title-before` or a custom nav title) with no extra border; `logo:` in the VitePress config no longer renders the static favicon in the header.
- Visual check in all docs themes x light/dark (at least Classic and Gruvbox): the docs logo matches the landing logo for the same theme; declared shots or screenshots of the docs header in those four combinations are attached to the task and every image is opened and compared with the landing page.
- The favicon, social/OG images and the landing page are unchanged; `bun run docs:build` (or the repo's docs build) and the landing build pass.
- Accessibility: the logo stays `aria-hidden` next to the visible wordmark, and the home link keeps its accessible name.
- Short note in `landing/README.md` or the docs README on where the shared logo geometry lives.

## Notes for AI
Start from `landing/src/components/SiteLogo.vue` and `landing/src/assets/logo.svg`; for the docs side look at `user-docs/.vitepress/config.mts` (~line 59), `user-docs/.vitepress/theme/index.ts` (register a layout slot) and `custom.css` (the theme tokens the docs defines, including `--vp-c-*` variables and the Gruvbox variants). Prefer CSS variables already defined by the docs theme over hard-coded colours. Do not touch `repoos.toml`. Source: Nick, 2026-10-20 (five screenshots attached: landing in four theme/appearance combinations, and the docs header with the extra border).

## Shots
```json
[
{
"label": "Docs header logo, Classic dark",
"target": "Docs site",
"route": "/?theme=classic&appearance=dark",
"highlight": ".docs-logo"
},
{
"label": "Docs header logo, Classic light",
"target": "Docs site",
"route": "/?theme=classic&appearance=light",
"highlight": ".docs-logo"
},
{
"label": "Docs header logo, Gruvbox light",
"target": "Docs site",
"route": "/?theme=gruvbox&appearance=light",
"highlight": ".docs-logo"
},
{
"label": "Docs header logo, Gruvbox dark",
"target": "Docs site",
"route": "/?theme=gruvbox&appearance=dark",
"highlight": ".docs-logo"
}
]
```

## Screenshots

![10](/api/tasks/0862/attachments/att_6f006c24-5900-4dad-96e7-a7fd6ff2612b.png)
![11](/api/tasks/0862/attachments/att_8065b649-a916-4dc5-a71d-327add82b04a.png)
![12](/api/tasks/0862/attachments/att_5d6288e7-76d5-48d8-a68b-879d68814f86.png)
![13](/api/tasks/0862/attachments/att_3a484aab-c29d-4d42-b95a-bb5a01ed8961.png)
![14](/api/tasks/0862/attachments/att_97366d86-efe1-4634-9672-80441a0938d1.png)
![docs-classic-light](/api/tasks/0862/attachments/att_3d1a4e14-3720-4610-9783-0a983a12c14c.png)
![docs-classic-dark](/api/tasks/0862/attachments/att_fee2d465-67f1-46f6-a1ee-a702a4fc37f1.png)
![docs-gruvbox-light](/api/tasks/0862/attachments/att_f0b831fc-2bc6-4304-b573-f2538992d33b.png)
![docs-gruvbox-dark](/api/tasks/0862/attachments/att_cb246f30-90d7-4a7a-9a6f-e1b71b0ffafc.png)

## Activity

- 2026-10-20T06:23:23Z · created · njachowski@gmail.com
- 2026-10-20T06:23:25Z · screenshots
- 2026-10-20T11:25:37Z · status inbox→ready
- 2026-10-21T03:54:30Z · status ready→active, branch
- 2026-10-21T04:02:15Z · note: route /404.html?theme=classic&appearance=light is not served by target "Docs site" — the target returned its HTML shell for an app module (TypeError: 'text/html' is not a valid JavaScript MIME type for module script 'http://127.0.0.1:55031/404/index.md?import&t=1792555334163'.)
- 2026-10-21T04:03:48Z · body
- 2026-10-21T04:04:18Z · note: click .VPNavBarHamburger: click: Timeout 5000ms exceeded. on /?theme=gruvbox&appearance=dark
- 2026-10-21T04:05:04Z · body
- 2026-10-21T04:07:14Z · note: stopped orphaned engineer pid 1217
- 2026-10-21T04:07:18Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T04:07:18Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T04:08:08Z · note: stopped orphaned engineer pid 26284
- 2026-10-21T04:08:12Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T04:08:41Z · body
- 2026-10-21T04:09:06Z · engineer crash recovery: switched opencode + opencode-go/deepseek-v4.1-flash → opencode + opencode-go/glm-5.3-flash after 3/3 crashes in 30m · the agent process exited with an error — open the task to see the full output
- 2026-10-21T04:10:13Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T04:13:34Z · screenshots
- 2026-10-21T04:13:51Z · body
- 2026-10-21T04:13:57Z · body
- 2026-10-21T04:19:18Z · body
- 2026-10-21T04:21:19Z · body
- 2026-10-21T04:21:20Z · body
- 2026-10-21T04:21:54Z · body
- 2026-10-21T04:23:17Z · body
- 2026-10-21T04:24:28Z · body
- 2026-10-21T04:26:55Z · cli_override, model_override
- 2026-10-21T04:27:02Z · model_override
- 2026-10-21T04:27:08Z · note: stopped orphaned engineer pid 37832
- 2026-10-21T04:30:46Z · body
- 2026-10-21T04:35:27Z · body
- 2026-10-21T04:35:58Z · body
- 2026-10-21T04:37:38Z · body
- 2026-10-21T04:45:14Z · CTO nudge: held — machine under pressure (the memory compressor is holding 37% of RAM (8.8 GB of RAM) — holding new work until memory pressure eases)
- 2026-10-21T04:49:45Z · needs_input
- 2026-10-21T05:03:21Z · note: handoff requested (ui-review)
- 2026-10-21T05:03:23Z · message_queued at 2026-10-21T05:03:23.474Z
- 2026-10-21T05:39:59Z · handoff failed · ui-review handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-21T05:48:39Z · note: handoff requested (ui-review)
- 2026-10-21T05:57:03Z · status active→review
- 2026-10-21T05:57:04Z · note: shots: skipped — 28 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-21T05:58:44Z · note: review pass 1: good to go
- 2026-10-21T06:03:28Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T06:03:38Z · close-out gate completed in 280s

