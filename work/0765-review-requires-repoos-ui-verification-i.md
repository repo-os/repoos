---
id: "0765"
title: "Review requires .repoos/ui-verification/<id>.json for command-target shots, which nothing produces: reviews of native tasks loop on missing evidence"
type: bug
status: review
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/review-requires-repoos-ui-verification-i
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-13T10:43:52Z"
updated_at: "2026-10-13T11:18:02Z"
---
## Problem
The reviewer prompt (src/server/review.ts, 'UI verification evidence' section) tells the reviewer to treat a missing <cacheDir>/ui-verification/<taskId>.json as a blocking evidence gap. That file is produced by the web handoff gate (ui-handoff-gate.ts) for browser captures. Command-based shot targets (#0761, native macOS/iOS/Android) produce images but no such file, so the reviewer reports 'required evidence file is absent' as a BLOCKING issue on every native UI task even when the shots exist and look right. Observed in the Divot repo on #0083 and #0084: repeated 'needs some work' passes whose only blocker was the absent ui-verification JSON, and engineers (which cannot create it) loop or guess.

## Desired UX
- Command-target captures record an equivalent evidence file (captured at tree, target name, command, exit status, list of images with sizes, tail of stdout/stderr, no browser console section) so the reviewer can verify provenance, or the reviewer prompt and automated verification treat command targets as not requiring the browser console record.
- The reviewer is told, in the prompt it receives, whether browser UI verification applies to this task, and is never told to block on a file that this task type cannot produce.

## Acceptance criteria
- Handoff capture for [[shot.targets]] writes the evidence record alongside the images (gitignored cache dir) and the reviewer prompt summarises it as it does for web captures.
- A task whose only shots come from command targets never gets 'ui-verification JSON absent' as a blocking finding; test the prompt text and the mechanical verification for both cases.
- Stale-capture detection is applied to command captures the same way (tree identity recorded).
- Docs (docs/previews.md, user-docs) updated.

## Notes for AI
Related: #0761 (command shot targets), #0714/#0762 (mechanical review verification and its misfires). Keep web behaviour unchanged.

## Activity

- 2026-10-13T10:43:52Z · created · njachowski@gmail.com
- 2026-10-13T10:51:33Z · status inbox→ready
- 2026-10-13T10:51:49Z · model_override
- 2026-10-13T10:51:58Z · status ready→active, branch
- 2026-10-13T11:04:10Z · body
- 2026-10-13T11:05:42Z · body
- 2026-10-13T11:09:10Z · body
- 2026-10-13T11:11:09Z · body
- 2026-10-13T11:18:02Z · status active→review
