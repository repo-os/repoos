# Web app first-run and empty states (2026-11)

## Scope

This pass covers a new project's Work queue, its failed initial task load, and
the Agents page when no agents are configured. The target widths are 1280px and
375px. Preview fixtures (`work:empty`, `work:failedLoad`, and `agents:empty`)
make these screens repeatable.

## Findings and changes

- A successful empty board previously showed only empty columns with dash
  placeholders. It now gives a first step and a **Create a task** action.
- A failed initial health or board request previously left Work looking empty.
  The page now distinguishes a failed load, explains the likely server issue,
  and offers **Retry**. Successful board refresh clears the error.
- API transport failures use the existing user-facing server connection
  message; the UI does not expose browser `Failed to fetch` text.
- The Agents page now detects a project with no configured roles and offers a
  direct route to built-in agent choices. Its fixture simulates the state
  without modifying project configuration.

## Manual QA

The auth-less server was started with `just serve-noauth 7272` from this task
worktree. Headless Playwright WebKit exercised the UI at 1280×900 and 375×812.
For `work:empty`, `work:failedLoad`, and `agents:empty`, the document width
matched the viewport at both sizes (no horizontal overflow), the expected
guidance was visible, and no page or console errors were observed.

I also simulated an actual `/api/board` network failure, confirmed the Work
error message and recovery instructions at both widths, then selected **Retry**
and allowed the request through. The board recovered and tasks appeared at
both sizes, with no page or console errors. Managed preview routes are
`/work?shotState=work:empty`, `/work?shotState=work:failedLoad`, and
`/agents?shotState=agents:empty`.

## Verification

The fixture tests assert distinct Work states and that the Agents fixture does
not mutate project configuration. Mobile queue tests cover initial load failure
and successful retry. The API wrapper's existing tests cover friendly network
and non-JSON errors. The scoped RepoOS check result is recorded in the handoff.
