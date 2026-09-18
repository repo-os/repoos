---
id: "0424"
title: "New Skill Suggestion: Fix mobile horizontal overflow in RepoOS static sites"
type: spec
status: done
priority: p2
area: "landing, user-docs"
assigned_to: human
created_by: ""
branch: ""
created_at: "2026-09-18T17:31:51Z"
updated_at: "2026-09-18T18:46:28Z"
---
## Decision

Rejected — do not create a skill from this draft.

Task #0410 had not been independently validated when the suggestion pass ran, and its proposed root-level overflow clipping was later shown to hide, rather than fix, the layout defect. This is therefore not trustworthy reusable guidance.

The alleged procedure is also below the skill threshold. The durable outputs are a mobile-layout regression test, task-specific acceptance criteria, and the engineering rule that root overflow clipping must not be used to mask layout overflow. None merits a standalone reusable skill.

Follow-up: #0429 hardens the skill-suggestion lifecycle and quality gate so similarly weak or unverified drafts are not turned into human inbox tasks.

## Activity

- 2026-09-18T17:31:51Z · created · unknown
- 2026-09-18T18:46:27Z · body
- 2026-09-18T18:46:28Z · status inbox→done
