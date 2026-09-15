---
id: "0353"
title: "commitTaskFile commits the whole git index, not just the task file"
type: bug
status: ready
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-09-15T10:45:58Z"
updated_at: "2026-09-15T15:00:26Z"
---
## Problem

`commitTaskFile()` in `src/core/git.ts` (around line 1100) stages the task file
and then runs a plain `git commit -m <message>`. A plain commit takes the
**entire index**, so anything a human or agent has already staged in the main
checkout gets committed along with the task file, under a misleading
`docs(<id>): update task` message.

## Seen in practice (2026-09-15)

During a hot fix on `main`, a staged `git rm vite` (deleting a stray file) was
waiting to be committed. The server's automatic task commit for #0348's review
pass (`e0530b6a docs(0348): update task`) swept it in: that commit contains
#0348's task file **and** the 79-line `vite` deletion. Nobody chose to commit
that deletion under that message, and the server does these commits on its own
schedule, so it can happen to any staged change.

## Fix

Commit only the task file, the same way `git.ts` already does a few functions
earlier (around line 980):

```ts
git(root, ["commit", "-o", "-m", message, "--", rel])
```

`-o` / `--only` with a pathspec commits just that path and leaves the rest of
the index staged. Check the other automatic commits in `src/core/git.ts` and
`src/server/` for the same pattern while you're there, but don't change the
ones that are *meant* to commit everything (for example "sync working tree
before merge").

## Acceptance criteria

- [ ] With an unrelated file staged in the main checkout, a task update commits
      only the task file, and the unrelated file is still staged afterwards.
- [ ] A test covers that case.
- [ ] Any other automatic commit that should be single-path gets the same treatment.
- [ ] `repoos check` passes.

## Activity

- 2026-09-15T10:45:58Z · created · unknown
- 2026-09-15T15:00:20Z · status inbox→ready
- 2026-09-15T15:00:26Z · model_override
