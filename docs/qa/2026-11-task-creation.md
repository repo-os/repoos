# QA: task creation and editing — November 2026

## Environment

- Auth-less preview launched with `just serve-noauth 7272` from a detached scratch worktree at this task branch's HEAD.
- Browser: Playwright Chromium, headless only. No visible browser or user Chrome was opened.
- Viewports: 1280 × 900 and 375 × 900.
- Target: `/work`; app reported connected and loaded the work queue.

## Results

| Flow / check | Result | Evidence |
| --- | --- | --- |
| Work queue load | Pass | Page title `RepoOS`; 87 task cards rendered; no page errors observed. |
| New task panel, desktop | Pass (panel opened) | New task dialog rendered with Freeform and Manual modes, screenshot dropzone, story picker, and Create task/Create draft actions. |
| New task panel, mobile | Pass (layout check) | At 375 px, document scroll width equaled viewport width (375 px); panel controls remained visible in the dialog. |
| Empty freeform submission | Not submitted | Create task and Create draft are disabled with an empty description, giving immediate validation. |
| Manual task form | Pass (form inspection) | Title, optional body, type, priority, area, and assignee controls rendered. |
| Existing task drawer | Pass (opened) | Opened task #1189; task summary and Task, PM, Dev, Review, Changes, Tokens, and Debug tabs rendered. No page errors observed. |
| Screenshot attachment | Partial | Added a 1 × 1 PNG through the screenshot input; the panel showed `Add more — 1 screenshot added` and `qa.png`. Upload plus task persistence was not confirmed. |
| Manual task creation save | Blocked by preview read-only policy | Filled a disposable title and clicked Create. The POST `/api/tasks` returned HTTP 405 with `preview servers are read-only`, which the UI displayed. No task was created. |
| Dependency selection / update save | Not exercised | The task drawer opened, but this pass did not modify or save task metadata. |

## Findings

The load, panel-open, viewport-fit, empty-form validation, and drawer-open checks behaved as expected. The Create attempt reached the API and was rejected by the intentional read-only preview guard (HTTP 405); the UI displayed the explanation. This is an environment restriction, not evidence of a task-creation defect. Screenshot selection updated the panel preview, but upload persistence cannot be established because all non-GET requests are blocked by the same guard. Dependency editing and save likewise cannot be verified on this server. No product code change or regression test was warranted by the observed response.

## Artifacts

Headless screenshots were captured locally during the pass at both viewport widths; they were temporary QA artifacts and are not committed. The scratch server ran against a detached copy so the task board used for this branch was not changed. `just serve-noauth` starts a preview child; its router rejects all non-GET/HEAD requests. Full CRUD and upload persistence require a writable test server, which conflicts with the task’s specified server command.
