---
id: "0823"
title: "Easter-eggs bundle layout: Items list with stable E-ids and one fixed section set per item"
type: chore
status: review
priority: p3
area: docs
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-layout-items-list-wit
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T02:48:44Z"
updated_at: "2026-10-18T03:11:21Z"
---
## Problem
Bundle tasks (e.g. #0822 before 2026-10-18) grow ad hoc: the first item takes the standard Problem/Desired UX/Acceptance/Notes headings and later items get free-form sections, so you cannot scan a bundle and list its sub-tasks. Repeated whole-body rewrites also left stale text ("third independent item").

## Desired UX
A bundle has one fixed shape: a top `## Items` checklist (`- [ ] **E1 · Title** (area) — one-line fix. Source: ...`) with a stable id per item, then one `## E<n> · Title` section per item, each with the same `### Problem / ### Desired UX / ### Acceptance criteria / ### Notes for AI` sub-headings. Add an item = append one list line and one section, using `--section`.

## Acceptance criteria
- docs/easter-eggs-bundles.md documents the layout with a short example (#0822 is the worked example) and says to edit with `--section`, never a full `--body`.
- AGENTS.md's easter-eggs rule points at that layout in one sentence.
- Any bundle template the PM/dispatch code or `repoos init` AGENTS.md template emits for new bundles uses the layout (check `src/commands/init.ts`; change the template deliberately).

## Notes for AI
Docs/template only; no parser or format change. Related: #0722, #0808.

## Activity

- 2026-10-18T02:48:44Z · created · njachowski@gmail.com
- 2026-10-18T02:57:35Z · status inbox→ready
- 2026-10-18T02:58:31Z · cli_override, model_override
- 2026-10-18T02:58:33Z · status ready→active, branch
- 2026-10-18T03:01:11Z · body
- 2026-10-18T03:10:24Z · status active→review
- 2026-10-18T03:10:26Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-18T03:11:21Z · note: review pass 1: good to go
