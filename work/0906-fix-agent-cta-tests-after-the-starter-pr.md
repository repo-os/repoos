---
updated_at: "2026-10-21T17:52:05Z"
review_passes: 1
id: "0906"
title: Fix agent-cta tests after the starter prompt heading changed to 'Get started with RepoOS'
type: feature
status: review
priority: p0
area: [core, docs]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/fix-agent-cta-tests-after-the-starter-pr
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-21T17:39:04Z"
---
## Problem
Commit 05c43f968 ('Fix starter prompt') changed the first line of agent/starter-prompt.md from '# Set up RepoOS in this repository' to '# Get started with RepoOS'. src/ui-app/tests/agent-cta.test.ts still asserts the old heading, so two tests fail on main ('uses the canonical starter prompt verbatim' and 'derives the compact preview from the opening of the prompt'). Every remote gate now fails on them: #0905's close-out (good to go), #0897 and #0899 handoffs were all rejected.

## Desired UX
Main is green again.

## Acceptance criteria
- src/ui-app/tests/agent-cta.test.ts line 16 expects '# Get started with RepoOS' and line 27 expects 'Get started with RepoOS' (read the file first; if the assertions moved, update the two assertions that check the starter prompt heading and its preview).
- Run src/ui-app/tests/agent-cta.test.ts and src/ui-app/tests/agent-file-build-checks.test.ts and show both pass.
- No other change: do not edit agent/starter-prompt.md, agent/cta.json or any other file.

## Notes for AI
Two-line test fix. Verify the test passes before handing off, then run repoos check --changed main. Tiny task: hand off promptly.

## Activity

- 2026-10-21T17:39:04Z · created · njachowski@gmail.com
- 2026-10-21T17:39:25Z · status inbox→ready
- 2026-10-21T17:39:33Z · cli_override, model_override
- 2026-10-21T17:39:35Z · status ready→active, branch
- 2026-10-21T17:41:38Z · body
- 2026-10-21T17:51:23Z · status active→review
- 2026-10-21T17:51:23Z · note: shots: skipped — the diff (2 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-21T17:52:05Z · note: review pass 1: good to go

