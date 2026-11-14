## TL;DR

Linux service installs now preserve the installing shell’s PATH, check configured agent CLIs before writing the unit, and report asynchronous `ENOENT` failures with the missing command and searched PATH. Final verdict: **good to go**; the task was merged and marked done.

## Outcome

The Linux systemd user unit now includes PATH from the installing environment, with escaping for systemd-sensitive characters and a fallback when PATH is unset. Installation checks that explicitly configured agent CLIs resolve on that PATH and gives remediation guidance when one is missing. Asynchronous spawn `ENOENT` errors now produce a task transcript entry naming the command and PATH searched.

macOS launchd was inspected and left unchanged because its plist already records PATH. The affected ThinkPad was not available, so no live Linux service verification was performed.

## Process stats

- Engineering rounds: 1. Review rounds: 1.
- Task created at 2026-11-13 01:24:51 UTC and marked done at 2026-11-13 06:31:26 UTC. Wall-clock from creation to done: 5h 6m 35s.
- Engineer: Codex, `gpt-6-luna`; one recorded session, elapsed 3025s, 23,204,385 tokens. Cost: not recorded.
- Reviewer: `composer-2.5`; one recorded session, elapsed 59s. Tokens and cost: not recorded.
- Router: `typesafe/jev-1.14-20261014`; one recorded session, elapsed 1s, 2012 tokens. Cost: not recorded.
- Close-out gate completed in 735s. Merged commit: `374db7710820c3e894058cba0c61117371a8abeb`.

## What went wrong

- The engineer received a completion nudge after five minutes without worktree activity. The queued message was still undelivered after 60 minutes. The task nevertheless reached review and completed close-out.
- An intermediate post-format check exited 255 during remote tests without test output. A retry passed, and the final check after the Cursor executable mapping correction passed.
- The engineer noted that the final check passed, including build and 248 scoped/always-run test files (4,004 passed, 1 skipped); local format, lint, build, UI smoke, and rendered contrast guards also passed.

## Learnings

- systemd user units need an explicit PATH for user-installed agent CLIs; launchd already handled this in its plist.
- Asynchronous child-process `error` events need to carry useful details into the task transcript so failures do not leave empty logs. The engineer placed the ENOENT classifier and test in `src/core`.
- The reviewer noted that install-time CLI checks could drift from spawn command resolution because they use a local mapping. Consider sharing that mapping if this area is extended.

## Follow-ups

None.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
