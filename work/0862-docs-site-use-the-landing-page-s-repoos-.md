---
id: "0862"
title: "Docs site: use the landing page's RepoOS logo (theme-aware, no extra border)"
type: chore
status: active
priority: p2
area: [docs, landing]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/docs-site-use-the-landing-page-s-repoos-
created_at: "2026-10-20T06:23:23Z"
updated_at: "2026-10-21T04:07:14Z"
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

## Screenshots

![10](/api/tasks/0862/attachments/att_6f006c24-5900-4dad-96e7-a7fd6ff2612b.png)
![11](/api/tasks/0862/attachments/att_8065b649-a916-4dc5-a71d-327add82b04a.png)
![12](/api/tasks/0862/attachments/att_5d6288e7-76d5-48d8-a68b-879d68814f86.png)
![13](/api/tasks/0862/attachments/att_3a484aab-c29d-4d42-b95a-bb5a01ed8961.png)
![14](/api/tasks/0862/attachments/att_97366d86-efe1-4634-9672-80441a0938d1.png)

## Shots
```json
[
{
"label": "Docs header logo — Gruvbox dark",
"target": "Docs site",
"route": "/?theme=gruvbox&appearance=dark",
"highlight": ".VPNavBarTitle",
"assert": [
{
  "selector": ".docs-logo",
  "label": "Inline theme-aware logo in the docs header"
}
]
},
{
"label": "Docs header logo — Gruvbox light",
"target": "Docs site",
"route": "/?theme=gruvbox&appearance=light",
"highlight": ".VPNavBarTitle",
"assert": [
{
  "selector": ".docs-logo",
  "label": "Inline theme-aware logo in the docs header"
}
]
},
{
"label": "Docs header logo on a doc page — Classic light",
"target": "Docs site",
"route": "/getting-started?theme=classic&appearance=light",
"highlight": ".VPNavBarTitle",
"assert": [
{
  "selector": ".docs-logo",
  "label": "Inline theme-aware logo in the docs header"
}
]
},
{
"label": "Docs header logo on a doc page — Classic dark",
"target": "Docs site",
"route": "/getting-started?theme=classic&appearance=dark",
"highlight": ".VPNavBarTitle",
"assert": [
{
  "selector": ".docs-logo",
  "label": "Inline theme-aware logo in the docs header"
}
]
},
{
"label": "Docs mobile header — Gruvbox dark",
"target": "Docs site",
"route": "/?theme=gruvbox&appearance=dark",
"highlight": ".VPNavBarTitle",
"assert": [
{
  "selector": ".docs-logo",
  "label": "Inline theme-aware logo in the docs header"
}
],
"viewportWidth": 390
}
]
```

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
