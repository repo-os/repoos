# QA pass: Deployments, Dev and Context (2026-11)

## Scope and method

Ran the auth-less preview server from the isolated task worktree with `just serve-noauth 7272`. Used Playwright Chromium in headless mode only. Checked each page at 1280px and 375px viewport widths, watched browser console errors, uncaught page errors, and failed requests, and exercised safe refresh/tab/navigation controls. No deployment was initiated and no dev process was started. Empty responses were injected in the browser for the Dev and Docs surfaces; no source data or configuration was changed for these checks.

## Results

| Page/state | Result |
| --- | --- |
| Deployments, configured project data | Loaded deployment targets for `prod` and `main`, branch distance, service cells, provider links and environment binding guidance. Refresh completed. At 1280px and 375px, document width matched viewport width. |
| Deployments, deploy confirmation | Opened the prod confirmation. It accurately described the fast-forward, fetch/push commands, affected services and remote side effect. Canceled with Escape; no deploy request was sent. |
| Dev, configured targets | Loaded five configured targets across server, build and process types, with status and Start controls. Refresh completed. At both widths there was no horizontal overflow. No target was started because these commands launch actual project processes. |
| Dev, empty targets | Intercepted the targets response with an empty list. The page displayed the instruction to add a `[[dev.targets]]` row and reload, without overflow at 375px. |
| Context, Docs | Loaded the repository document tree and selected `AGENTS.md` content. At both widths there was no horizontal overflow. |
| Context, Skills / Discover / History | Switched among all four tabs and back to Docs. Skills and History rendered populated lists; Discover displayed its catalog loading state during the observation window. No client errors or failed requests were observed. |
| Context, empty Docs | Intercepted the docs list with an empty response. The page displayed “No docs found” and the document selection prompt at 375px. |

## Console and layout

Across all observed routes, no browser console errors, uncaught page errors, or failed requests were recorded. On every page tested at 1280px and 375px, `document.documentElement.scrollWidth` equaled `innerWidth`. The empty Dev, Docs states also fit the 375px viewport.

## Bugs and follow-up

No reproducible defect was found in this pass, so no source fix or regression test was warranted. The populated Deployments view is backed by the project's configured deployment data; this pass did not alter repository configuration to fabricate an empty deployments setup. The Discover catalog was still showing “Loading Skills.sh…” after the short observation window, although no request failure or console error occurred. This is recorded as an observation rather than a defect because no failed or persistently stuck request was established. Deployment push and Dev process launch were deliberately not confirmed, as they produce real external or local side effects.
