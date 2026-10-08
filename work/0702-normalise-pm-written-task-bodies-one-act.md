---
id: "0702"
title: "Normalise PM-written task bodies: one `## Activity` section, no common leading indent"
type: feature
status: review
priority: p2
area: core
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/normalise-pm-written-task-bodies-one-act
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T03:15:55Z"
updated_at: "2026-10-08T14:53:29Z"
---
## Problem

In tuk-private, tasks #0004-#0008 (written by the PM during #0002) each contain `## Activity` twice in a row, and #0006's whole body is indented two spaces with one `## Activity` inside the indented block and another after it. Indented headings are not headings in Markdown, so section-aware tools (`--section`, the underspecified checker, reviewers) can misread the spec.

## Desired UX

Whatever the PM returns, the stored body has the spec sections at column 0 and exactly one Activity section at the end.

## Acceptance criteria

- [ ] On body write, strip a common leading indent and merge duplicate `## Activity` headings (keeping all entries in order).
- [ ] A one-time migration or index-time repair fixes existing files through the normal write path (commits like other task writes).
- [ ] Parser tests with the tuk-private shapes.

## Notes for AI

Evidence: `~/code/tuk/tuk-private/repoos/docs/repoos-feedback.md` (tuk-private run, 2026-10-06), item 9.

Related: #0613 (protect task bodies from clobbering, done).

## Activity

- 2026-10-06T03:15:55Z · created · unknown
- 2026-10-08T14:41:31Z · cli_override, model_override
- 2026-10-08T14:41:34Z · status inbox→ready
- 2026-10-08T14:41:36Z · status ready→active, branch
- 2026-10-08T14:45:58Z · body
- 2026-10-08T14:46:47Z · body
- 2026-10-08T14:53:29Z · status active→review
- 2026-10-08T14:53:29Z · note: shots: skipped — the diff (6 changed paths) touches no [[preview.paths]] globs — no UI change to capture
