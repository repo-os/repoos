---
id: "1097"
title: "landable/close-out: a review that says 'None found' under ## Bugs but explains its checks in bullets is treated as listing blocking bugs"
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Notes for AI"
priority: p2
area: [core, server]
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-12T01:26:13Z"
updated_at: "2026-11-12T01:26:14Z"
---
## Problem
A review whose verdict is 'good to go' and whose ## Bugs section reads 'None found' followed by explanatory prose and bullets (what the reviewer checked) is treated by `repoos landable` as 'the review still lists blocking bugs'. Seen on #1077 (review passes 1 and 2, both 'good to go'): landable stays red on 'Review verdict' and close-out would refuse, so a clean task cannot land and a human has to intervene. Earlier reviews flagged the same quirk ('Bugs-section bullets counted as blocking').

## Desired UX
The verdict line decides: 'good to go' plus a Bugs section that begins with 'None found' (or is empty) is landable, whatever follows it. Bullets after 'None found' are commentary, not findings.

## Acceptance criteria
- A review with verdict 'good to go' and '## Bugs' starting with 'None found' followed by bullets and prose is landable.
- A review with real numbered or bulleted findings and no 'None found' opener still blocks.
- A review with 'None found' and later numbered findings (mixed) still blocks (fail closed) — pick and document the rule.
- Tests for each; reviewer prompt gets one line telling it to put its checked-items list under Edge cases or a separate heading, not under ## Bugs.
- Docs: docs/close-out-pipeline.md or user-docs/review-and-close-out.md one line.

## Activity

- 2026-11-12T01:26:13Z · created · t@t
- 2026-11-12T01:26:14Z · needs_input
