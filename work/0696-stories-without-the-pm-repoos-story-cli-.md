---
id: "0696"
title: "Stories without the PM: `repoos story` CLI and an API create that writes exactly what it is given"
type: feature
status: active
priority: p2
area: [cli, server]
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/stories-without-the-pm-repoos-story-cli-
created_at: "2026-10-06T03:15:42Z"
updated_at: "2026-10-07T18:49:30Z"
---
## Problem

An agent (or script) cannot create a story deterministically. The only create path is `POST /api/stories/freeform` (the UI's New story), which always starts the PM agent afterwards: the PM rewrites the body (a 1,250-byte brief came back as a much longer page with new sections) and tags every untagged non-draft task it thinks belongs. There is no CLI at all (`repoos --help` lists no story command), and hand-writing `stories/*.md` bypasses the commit and numbering path. The tuk-private driver had to tag existing tasks first and create stories one at a time to keep the PM from re-tagging work.

## Desired UX

`repoos story new "<name>" --body <text|->` writes and commits the story exactly as given, prints its number and path, and starts no agent. `repoos story list`, `repoos story show <number|name>` and `repoos story update <number|name> --body/--name` cover the rest. The UI keeps its current PM flesh-out by default.

## Acceptance criteria

- [ ] `POST /api/stories` (or `POST /api/stories/freeform` with `pm: false`) writes and commits the definition via `writeStoryDefinition` + the existing commit path, returns the definition, and starts no PM run and no task tagging. Name collisions return 409 as today.
- [ ] A `PATCH /api/stories/:key` (or equivalent) updates name/body without the PM, keeping the stable number (rename keeps the number, as the PM rename does).
- [ ] CLI: `repoos story new|list|show|update`, board-rooted like `repoos new` (works from a worktree), committing like task writes; `--body -` reads stdin; `--json` on list/show.
- [ ] `repoos new/update --story` keep working; `repoos story show` lists member tasks with status.
- [ ] Help text, `user-docs/cli.md` and the Stories section of `user-docs/configuration.md` document both paths (PM flesh-out in the UI, verbatim via CLI/API).
- [ ] Tests: CLI create/update/list round-trip in a temp repo; API create with `pm: false` asserts no PM run was started; tag-only stories unaffected.

## Notes for AI

Evidence: `~/code/tuk/tuk-private/repoos/docs/repoos-feedback.md` (tuk-private run, 2026-10-06), item 5.

Code: `src/server/routes/stories.ts` (`createFreeformStory`), `src/core/story-definition-files.ts` (`writeStoryDefinition`, `rewriteStoryDefinition`), `src/commands/tasks.ts` for CLI patterns (`NEW_FLAGS`/`UPDATE_FLAGS`), `src/cli/` for command registration.

## Activity

- 2026-10-06T03:15:42Z · created · unknown
- 2026-10-07T18:06:11Z · status inbox→ready
- 2026-10-07T18:06:15Z · status ready→active, branch
- 2026-10-07T18:15:21Z · body
- 2026-10-07T18:17:01Z · body
- 2026-10-07T18:19:36Z · body
- 2026-10-07T18:27:51Z · handoff failed · remote validation failed: remote validation failed (exit 1) —  ❯ tests/story-cli-and-verbatim-api.test.ts:358:37
    356|     try {
    357|       await withCwd(root, () => cmdStoryShow(["Launch checklist"]));
    358|       expect(process.exitCode ?? 0).toBe(0);
       |                                     ^
    359|       const out = logs.join("\n");
    360|       expect(out).toContain("tag-only");
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 440 passed | 1 skipped (442)
      Tests  1 failed | 5373 passed | 15 skipped (5389)
   Start at  18:21:07
   Duration  394.14s (transform 9.60s, setup 4.19s, import 81.11s, tests 262.22s, environment 393.13s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 780ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  18:27:42
   Duration  4.74s (transform 2.37s, setup 18ms, import 2.91s, tests 780ms, environment 872ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T18:32:52Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/story-cli-and-verbatim-api.test.ts:358:37 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T18:32:52Z · status review→active
- 2026-10-07T18:37:57Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/story-cli-and-verbatim-api.test.ts:358:37
    356|     try {
    357|       await withCwd(root, () => cmdStoryShow(["Launch checklist"]));
    358|       expect(process.exitCode ?? 0).toBe(0);
       |                                     ^
    359|       const out = logs.join("\n");
    360|       expect(out).toContain("tag-only");
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 440 passed | 1 skipped (442)
      Tests  1 failed | 5373 passed | 15 skipped (5389)
   Start at  18:33:35
   Duration  257.12s (transform 6.69s, setup 2.10s, import 45.89s, tests 239.07s, environment 204.18s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 757ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  18:37:53
   Duration  2.70s (transform 1.14s, setup 12ms, import 1.41s, tests 757ms, environment 438ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T18:43:52Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/story-cli-and-verbatim-api.test.ts:358:37 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T18:43:52Z · status review→active
- 2026-10-07T18:49:30Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/story-cli-and-verbatim-api.test.ts:358:37 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T18:49:30Z · status review→active
