---
id: "0680"
title: "UI verification gate: fail UI handoffs on browser console errors; reviewer sees the screenshots"
type: feature
status: inbox
priority: p2
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T16:58:42Z"
updated_at: "2026-10-05T17:16:55Z"
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

## Activity

- 2026-10-05T16:58:42Z · created · unknown
- 2026-10-05T17:16:55Z · story
