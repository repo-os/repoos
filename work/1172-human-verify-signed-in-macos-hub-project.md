---
id: "1172"
title: "Human: verify signed-in macOS Hub projects and tasks"
type: bug
status: inbox
needs_input: true
questions: ["\"Sign in to the connected server in the macOS Hub and verify projects", tasks, "and task drawers render without errors.\""]
hold: true
priority: p2
area: macos
assigned_to: human
created_by: t@t
branch: ""
created_at: "2026-11-18T03:42:42Z"
updated_at: "2026-11-18T03:43:01Z"
---
## Problem
The #1169 QA pass verified build, launch, discovery, connection, and the sign-in page, but could not authenticate through synthetic WKWebView input.

## Step-by-step guide
1. Launch RepoOS Hub for Mac and connect to the configured RepoOS server.
2. Sign in with a valid account using the email code.
3. Open Projects, Tasks, and a task drawer; check for blank screens, navigation failures, or visible errors.
4. Record the result and any reproduction steps in this task.

## Done when
Projects, tasks, and task details render without errors, or a concrete bug is recorded.

## Activity

- 2026-11-18T03:42:42Z · created · t@t
- 2026-11-18T03:43:01Z · body: Problem (added); Step-by-step guide (added); Done when (added); Problem\nThe #1169 QA pass verified build, launch, discovery, connection, and the sign-in page, but could not authenticate through synthetic WKWebView input.\n\n## Step-by-step guide\n1. Launch RepoOS Hub for Mac and connect to the configured RepoOS server.\n2. Sign in with a valid account using the email code.\n3. Open Projects, Tasks, and a task drawer; check for blank screens, navigation failures, or visible errors.\n4. Record the result and any reproduction steps in this task.\n\n## Done when\nProjects, tasks, and task details render without errors, or a concrete bug is recorded. (removed); Human task (removed)
