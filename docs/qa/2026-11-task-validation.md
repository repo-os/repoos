# Task creation and update validation QA — November 2026

## Scope

This pass compared task creation and body updates across `repoos new`,
`repoos update`, the task drawer, and the task API. The shared body assessment
is intentionally a durable `needs_input` state rather than a hard rejection:
an incomplete task remains saved, and the reason tells its owner what needs
attention. Human-assigned tasks are exempt from the agent task-body contract.

## Findings and changes

- `repoos new` and `POST /api/tasks` already run the shared body and human-step
  assessments at creation. The CLI prints the resulting needs-input detail.
- The task drawer previously closed after creating an underspecified task with
  no explanation. It now leaves a toast explaining that the new task needs
  input and includes the assessment detail (or a useful fallback).
- `PATCH /api/tasks/:id` re-runs those assessments after a body, section, or
  assignee edit. `repoos update` did not. This meant an incomplete body edit
  would be flagged in the UI but not in the CLI, and a repaired body could keep
  a stale flag in the CLI. The CLI now invokes the same async shared assessment
  for those edits, prints active needs-input detail, and clears its own stale
  spec flag when the body is complete.
- Validation parity does not mean rejecting stubs. Both paths preserve the
  task and make its waiting state visible, so a user can edit or flesh it out.

## Verification

- Added a regression to `src/ui-app/tests/cli-worktree-write-target.test.ts`:
  a short replacement body raises `needs_input: true` with reason
  `underspecified`; a complete replacement clears that owned flag.
- Ran `bun run test -- src/ui-app/tests/cli-worktree-write-target.test.ts`.
  Result: 2 test files passed (the wrapper also ran the isolated boot-timing
  suite), 15 tests passed.
- Ran `REPOOS_CHECK_CHANGED=main repoos check`. The remote changed-path gate,
  build, format/lint, CSS/theme guards, rendered contrast audit, and local
  headless UI smoke test passed. The first run caught formatting in the touched
  TypeScript files; `bun run fmt` fixed it before the green rerun.
- Started `just serve-noauth 7273` from this task worktree and used headless
  Playwright. The dashboard and New task drawer loaded, and a task drawer with
  an existing needs-input state showed the reason and next steps. No page errors
  were observed. Port 7272 was already occupied, so the QA server used 7273 and
  was stopped after verification.
- For review round 2, added the client-only `toast:taskNeedsInput` shot fixture
  and declared a capture for the resulting toast. Headless Playwright rendered
  the toast over the Work queue and showed the complete missing-sections detail;
  no page errors were observed. The screenshot is in the ignored `.repoos`
  directory. The preview remains read-only, so no disposable task was submitted
  or written into this worktree.

## Remaining note

Creation uses the shared server-side assessment, while the UI toast is a
presentation of the returned task state. The CLI and UI continue to use the
same machine-readable `needs_input_reason` values; the human-readable detail is
the actionable surface for underspecified-body cases.
