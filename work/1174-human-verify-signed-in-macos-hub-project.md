---
id: "1174"
title: Human verify signed-in macOS Hub projects and tasks
type: bug
status: inbox
needs_input: true
questions: ["Please sign in to the Hub build from QA pass #1169 and confirm projects and tasks render without errors."]
hold: true
priority: p2
area: macos
depends_on: ["1169"]
assigned_to: human
created_by: t@t
branch: ""
created_at: "2026-11-18T04:07:13Z"
updated_at: "2026-11-18T04:07:13Z"
---
## Problem
The #1169 macOS Hub QA pass verified build, launch, server discovery, connection, and the sign-in page, but automated input could not complete email-code sign-in. The projects and tasks acceptance criterion remains unverified.

## Step-by-step guide
1. Build and launch the #1169 branch build, or use its checked app from DerivedData.
2. Sign in with the authorized RepoOS account using the normal email-code flow.
3. Open the projects view and confirm it renders without a blank screen, crash, or visible error.
4. Open the tasks view and confirm it renders without a blank screen, crash, or visible error.
5. Record the macOS version, app build/commit, results, and any error details in this task.

## Acceptance criteria
- Projects view is observed and reported.
- Tasks view is observed and reported.
- Evidence identifies the tested build and reports any errors.

## Human task

_Assigned to a human, not an AI agent. No `## Notes for AI` is required here; the acceptance criteria are the human's checklist._

## Activity

- 2026-11-18T04:07:13Z · created · t@t
