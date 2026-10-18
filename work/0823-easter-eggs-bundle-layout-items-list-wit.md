---
id: "0823"
title: "Easter-eggs bundle layout: Items list with stable E-ids and one fixed section set per item"
type: chore
status: inbox
priority: p3
area: docs
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-18T02:48:44Z"
updated_at: "2026-10-18T02:48:44Z"
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
