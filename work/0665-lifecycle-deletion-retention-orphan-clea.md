---
id: "0665"
title: "Lifecycle: deletion, retention, orphan cleanup, recovery"
type: feature
status: inbox
priority: p1
area: core
story: Cloud attachment storage
depends_on: ["0661"]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T08:29:30Z"
updated_at: "2026-10-05T12:05:54Z"
---
---
id: "0665"
title: "Lifecycle: deletion, retention, orphan cleanup, recovery"
type: feature
status: inbox
priority: p1
area: core
story: Cloud attachment storage
depends_on: ["0661"]
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-10-05T08:29:30Z"
updated_at: "2026-10-05T08:29:30Z"
---
Slice 8: Deletion, retention, orphan cleanup, recovery documented and tested. State behavior on clone, move to another machine, restore, worktree access.

## Original prompt
Slice 8: Deletion, retention, orphan cleanup, recovery documented and tested. State behavior on clone, move to another machine, restore, worktree access.

## Problem
When a task or input is deleted, or when attachments outlive their parent record, the current behavior around cloud-backed files is undefined: does the attachment survive, is it retained under a window, are orphaned cloud objects cleaned, and can a deleted reference be recovered? On clone, move to another machine, or restore, it is also unclear whether the attachment reference resolves, whether local originals are restored or rebuilt, and what a worktree sees. Without explicit documentation and tests, the lifecycle behaviors become implicit and diverge between local and cloud backends.

## Desired UX
No direct UI change for this slice — this is documentation and test coverage. The expected user-visible outcomes are: deleting a task/input does not corrupt remaining references; moving a repo to another machine keeps cloud attachments reachable via their stable references; orphaned objects are eventually cleaned; and recovery paths are documented so a user knows what survives and what does not after deletion, clone, or restore.

## Acceptance criteria
- Deletion behavior is documented: what happens to cloud attachments when a task/input is deleted, whether deletion is soft or hard, and whether local originals are removed.
- Retention policy is documented: how long attachments survive after parent deletion, whether a window exists, and how it applies to both local and cloud backends.
- Orphan cleanup is documented and tested: how orphaned cloud objects (references without parents) are detected, on what schedule or trigger they are swept, and whether the sweep can ever delete a local original.
- Recovery behavior is documented: what can be restored from a deleted task/input, whether references can be recovered, and what state exists after restore.
- Clone/move-to-another-machine behavior is documented and tested: whether cloud attachments remain reachable, whether references resolve, and whether the new machine needs credentials or settings to read them.
- Worktree access is documented: what a cloud-backed attachment looks like from inside a task worktree, confirming the resolver does not depend on a path that only exists in the main checkout.
- All of the above are covered by tests, not only by docs; any claim is either demonstrated by a test or explicitly absent from copy and docs.

## Notes for AI
This is slice 8 of the Cloud attachment storage story; it depends on 0661 (stable reference format) so the lifecycle behavior can reference the opaque handle rather than provider-specific URLs. It does not introduce a new UI or change the provider interface; it defines, documents, and tests the behaviors that the previous slices assume. Keep zero runtime dependencies; document any exception. Keep the task-asset guard unchanged.

## Activity

- 2026-10-05T08:29:30Z · created · unknown
- 2026-10-05T11:15:29Z · needs_input
- 2026-10-05T12:04:49Z · needs_input
- 2026-10-05T12:05:54Z · body
