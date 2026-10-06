---
id: "0680"
title: "UI verification gate: fail UI handoffs on browser console errors; reviewer sees the screenshots"
type: feature
status: review
priority: p2
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/ui-verification-gate-fail-ui-handoffs-on
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-05T16:58:42Z"
updated_at: "2026-10-06T01:42:28Z"
review_passes: 2
review_rounds: 1
---
## Problem

Four UI defects in one project passed unit tests, `repoos check` AND the LLM review, and were only caught by a human opening the task preview in a real browser: a blank map (MapLibre worker failed to load; tests mock maplibre), mini bars all drawn at x=0, a map layer rejected by MapLibre with an invalid expression (console error only, no spots drawn), and a page 1,542px wide at a 1024px viewport. The reviewer verifies by reading the diff and running tests; it never looks at the app. The Cursor reviewer also twice ran `bun run dev` (never exits), got killed, and wrote an `incomplete` review with no verdict.

## Desired UX

- For tasks that touch UI areas, handoff captures the declared Shots AND the browser console; any console error, failed request or horizontal overflow (`scrollWidth > innerWidth`) at configured viewport widths fails the handoff with the captured evidence.
- The reviewer receives the captured screenshots and console log and must comment on them; blank/error screenshots are flagged.
- Default reviewer instructions: never start long-running processes; always end with a verdict. An `incomplete` review auto-retries once.
- Keep every review pass as a numbered artifact (`reviews/<id>/<pass>.md`) and add a one-line summary per pass to the task activity log. The current `reviews/<id>.md` is overwritten each pass (one-time sign-off artifact); findings delivered by message are lost when the engineer session changes (e.g. switching CLI/model). Include the latest unresolved findings in the prompt of any NEW engineer session.

## Acceptance criteria

- Tests with a stub page that logs a console error / overflows -> handoff fails with evidence. Review history persisted and shown in the drawer. `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Docs follow-up
The playbook page `user-docs/running-with-agents.md` (landed on main) describes the CURRENT behaviour that this task changes. When this task lands, update the page: section 4, the bullets about looking at UI work yourself and about the review report being overwritten each pass. In short: describe the console/overflow gate, the screenshots the reviewer now sees, and the kept review history. Keep the page accurate rather than aspirational; if this task is declined, leave the page as is. (This replaces the open task 0689, which is being removed.)

## Shots
```json
[
  {
    "label": "Task drawer review history list",
    "target": "default",
    "route": "/",
    "highlight": ".review-history",
    "steps": [
      {
        "click": "[data-task-id=\"0680\"]"
      },
      {
        "waitMs": 400
      }
    ]
  }
]
```

## Activity

- 2026-10-05T16:58:42Z · created · unknown
- 2026-10-05T17:16:55Z · story
- 2026-10-05T17:16:56Z · body: section Story context
- 2026-10-05T17:32:22Z · body: section Docs follow-up
- 2026-10-05T23:35:16Z · status inbox→ready
- 2026-10-05T23:35:19Z · cli_override, model_override
- 2026-10-05T23:35:19Z · status ready→active, branch
- 2026-10-06T00:14:51Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-06T01:05:55Z · body: section Shots
- 2026-10-06T01:16:12Z · status active→review
- 2026-10-06T01:16:28Z · note: shots: failed — capture of Task drawer review history list on "default" failed: click: Timeout 5000ms exceeded.
- 2026-10-06T01:17:16Z · status review→active
- 2026-10-06T01:37:32Z · status active→review
- 2026-10-06T01:37:51Z · note: shots: failed — capture of Task drawer review history list on "default" failed: click: Timeout 5000ms exceeded.

