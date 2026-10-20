---
id: "0885"
title: "Stories list: \"most recently updated\" sort puts a just-created story at the bottom"
type: bug
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/stories-list-most-recently-updated-sort-
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T16:03:09Z"
updated_at: "2026-10-20T23:43:06Z"
---
## Problem
On the Stories page, ordering by "most recently updated" does not put the newest or most recently edited story first. Story #0011 ("Agent-discoverable RepoOS"), created and edited minutes earlier, appeared at the bottom of the list. The owner's guess is that the list sorts by the story number as a string, so "0011" or "11" lands next to "1" instead of above "9". It may instead be sorting by `created_at` ascending, by file name, or by a field that story edits never touch (stories keep `created_at` in frontmatter and may have no `updated_at`).

## Desired UX
"Most recently updated" shows the story that was created or edited last at the top. Any numeric ordering compares story numbers as numbers, never as text. Creating or editing a story moves it to the top without a manual refresh.

## Acceptance criteria
- Find the sort used by the Stories view and identify the actual cause (string number comparison, ascending order, or a missing updated timestamp).
- Fix it so "most recently updated" orders by the last modification (use the git commit time or file mtime if the frontmatter has no `updated_at`), newest first.
- Numeric sorts use numeric comparison, tested with stories numbered 1, 9, 10 and 11.
- A test covers the ordering, including a story created after an older one that has a smaller story number and a larger number created earlier.
- Check the other sortable lists in the web UI that sort on a numeric-looking id (stories, inputs, tasks) for the same string-comparison bug, and fix any found.

## Notes for AI
- Start from the Stories view under `src/ui-app/src/views/` and the stories store or API route it reads; `repoos story list` in the CLI is the reference ordering to compare with.
- Story files live in `stories/*.md` with `number` as a quoted string in frontmatter ("0011"), which is why a naive `a.number > b.number` or an unparsed sort goes wrong.

## Shots
```json
[
{
"label": "Stories list ordered most-recently-updated first",
"target": "default",
"route": "/stories",
"highlight": ".stories-grid"
}
]
```

## Activity

- 2026-10-20T16:03:09Z · created · njachowski@gmail.com
- 2026-10-20T23:17:55Z · status inbox→ready
- 2026-10-20T23:18:01Z · cli_override, model_override
- 2026-10-20T23:18:02Z · status ready→active, branch
- 2026-10-20T23:26:19Z · body
- 2026-10-20T23:32:14Z · body
- 2026-10-20T23:34:55Z · body
- 2026-10-20T23:38:04Z · body
- 2026-10-20T23:38:45Z · body
- 2026-10-20T23:39:34Z · body
- 2026-10-20T23:41:19Z · body
- 2026-10-20T23:43:06Z · body
