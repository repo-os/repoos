# Web app first-run and empty states (2026-11)

## Scope

This pass covers a new project's Work queue, its failed initial task load, and
the Agents page when no custom agents have been added. The target widths are
1280px and 375px. The Work states have preview fixtures (`work:empty` and
`work:failedLoad`) so the same screens can be reviewed repeatably. The Agents
page already shows “No custom agents yet — add one above.”

## Findings and changes

- A successful empty board previously showed only empty columns with dash
  placeholders. It now gives a first step and a **Create a task** action.
- A failed initial health or board request previously left Work looking empty.
  The page now distinguishes a failed load, explains the likely server issue,
  and offers **Retry**. Successful board refresh clears the error.
- API transport failures use the existing user-facing server connection
  message; the UI does not expose browser `Failed to fetch` text.

## Manual QA

The auth-less server was started with `just serve-noauth 7272` from the task
worktree and opened in Chrome at `http://127.0.0.1:7272`. The initial desktop
page loaded with the live server and current project data. The Work fixtures
are available for managed preview capture at `/work?shotState=work:empty` and
`/work?shotState=work:failedLoad`.

The available browser session did not expose responsive viewport controls or
the DevTools console through its automation bridge. Therefore, no 1280px or
375px measurements and no clean-console claim are recorded here. The layout
includes a narrow-screen wrapping rule, but a human/browser QA pass should
confirm it at both target widths and inspect console output.

## Verification

The fixture tests assert that the empty and failed-load fixtures clear existing
tasks and produce distinct states. The API wrapper's existing tests cover
friendly network and non-JSON errors. Record the scoped RepoOS check result in
the handoff after it completes.
