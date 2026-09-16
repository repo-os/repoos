---
id: "0369"
title: "Document rules for interactive agents driving the board directly, outside the normal task pipeline"
type: chore
status: active
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/document-rules-for-interactive-agents-dr
created_at: "2026-09-16T06:31:01Z"
updated_at: "2026-09-16T06:31:08Z"
---
## Problem

Live incident this session: an interactive Claude Code session (not a
RepoOS task-runner agent) created tasks and drove them through active/
review/done via the \`repoos mv\` CLI directly, outside the normal
task-runner pipeline. For #0365, it went active -> review -> done via two
separate \`repoos mv\` calls. The active->review transition triggered the
server's normal automatic reviewer spawn (\`startReview\` in
src/server/server.ts). The review->done transition SHOULD have cancelled
that run (\`reviews.cancel()\` in src/server/review.ts fires on \`prev ===
"review" && next !== "review"\`), but the spawned OS process kept running
for 6 more minutes regardless and, on finishing, tripped
\`enforceStillInReview\`'s guard (task file said \`done\` when a review
ended -> assumed the reviewer moved it there itself -> reverted to
\`review\`). The guard's own doc comment states the assumption plainly:
"every human route out of \`review\` cancels the run first" — an assumption
that held for the UI's synchronous PATCH request, but not for an external
CLI/file-write-driven transition discovered later by the async file
watcher.

Tasks #0366 and #0367 in the same session went straight active -> done
(no \`review\` hop) and landed cleanly with no such issue, confirming the
mechanism: skipping \`review\` entirely avoids spawning a reviewer to race
against in the first place.

## Desired outcome

Add a new section to AGENTS.md (placed right after "Review and sign-off
(review -> done)", since it's the same machinery from a different angle)
documenting this incident and explicit rules for an interactive/external
agent session driving the board directly via CLI/API rather than through
\`repoos start\`'s managed task-runner lifecycle. Cover:

- The #0365 incident as a concrete worked example (mirroring this file's
  existing incident write-ups elsewhere, e.g. "Stuck-active incident
  (#0151)" and the Debugging section's worked examples) — what happened,
  why, and how it was confirmed (ps showing the process alive 6 minutes
  after the done transition).
- The core lesson: a CLI status-change call is NOT a synchronous,
  system-has-settled operation. It's a file write the server discovers
  asynchronously via its file watcher; whatever background machinery that
  discovery triggers (spawning a reviewer, notifications, auto-dispatch)
  runs on its own clock, outside anything the external caller can see or
  block on.
- Concrete rules, roughly:
  1. To land something yourself without a human/reviewer in the loop, skip
     \`review\` entirely (active -> done directly) — avoids spawning a
     reviewer to race against.
  2. If you deliberately want the reviewer's advisory opinion first, enter
     \`review\` and WAIT for it to actually finish (e.g. confirm
     \`.repoos/reviews/<id>.md\` exists) before touching status again.
  3. Never assume a CLI status change synchronously cancels a running
     background job — treat any spawned process as running to completion
     regardless of what you do to the task file next.
  4. Claim a freshly created task by moving straight to \`active\` (skip
     \`ready\`) so auto-dispatch never sees it queued to grab concurrently.
  5. Re-check the task file against \`main\` immediately before merging, not
     just once early — other machinery can commit to \`main\` at any point.

## Notes for AI

- This is a docs-only change (AGENTS.md). No code changes, no new tests.
- Read the exact incident context in this session's own transcript isn't
  available to you, but the code paths are: src/server/server.ts's
  \`onStatusChange\`/\`startReview\`/the \`index.on\` handler around line 1485-
  1568, and src/server/review.ts's \`cancel()\` (~line 1163) and
  \`enforceStillInReview\` (~line 1476).
- Match this file's existing voice/format for incident write-ups (see
  "Stuck-active incident (#0151)" near the end of the file for the pattern:
  what happened, root cause, the fix/rule, what NOT to do).
- \`repoos check\` passes (should be a no-op for a docs-only change, but
  confirm the file is well-formed markdown and nothing else broke).

## Activity

- 2026-09-16T06:31:01Z · created · unknown
- 2026-09-16T06:31:07Z · branch
- 2026-09-16T06:31:08Z · status inbox→active
- 2026-09-16T06:31:08Z · note: Implementing directly per explicit user request in chat — claiming immediately to avoid a race with auto-dispatch.
