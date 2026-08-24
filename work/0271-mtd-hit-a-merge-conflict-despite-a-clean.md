---
id: "0271"
title: MTD hit a merge conflict despite a clean main before the click
type: bug
status: inbox
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-24T15:56:02Z"
updated_at: "2026-08-24T15:59:01Z"
---
## Problem
Main was clean (verified before clicking Move to done), but the merge still hit a conflict on click.

## Fix
Investigate why MTD reported a conflict against a clean main. Reproduce and fix the root cause — a clean main should never conflict on merge.

Related: this specific run's conflict turned out to be routine frontmatter/activity bookkeeping in the task file itself (see the debugger's diagnosis on this run, and #0276 for the broader "self-resolving staleness" pattern that may be the same root cause).

## Activity

- 2026-08-24T15:59:01Z · body
