---
id: "0595"
title: Failure tl;dr for Move-to-done errors
type: feature
status: inbox
priority: p2
area: [server, web]
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-30T03:02:23Z"
updated_at: "2026-09-30T03:02:23Z"
---
The failure tl;dr (#0570, src/server/debug-tldr.ts) only runs for needs-input reasons (review-failed, dev-error, check-failed-after-retries, watchdog-stuck). A failed Move to done is stored as a done error (repo.doneErrorFor, rendered by DoneErrorCard.vue in the task drawer and on the board card) and never reaches that path, so the drawer shows no 'tl;dr — what happened' for it. MTD errors are common and hard for humans to read (e.g. #0589: a vitest failure buried in remote-validation output).

Goal: when a close-out fails at a diagnosable step (check/build gate, validation, merge conflicts), run the same one-shot Debugger distillation once and show the sentence (root cause + next action) on the DoneErrorCard, including in its collapsed one-line state.

Notes:
- Reuse DebugTldrManager gates: dedupe by fingerprint of (step, message, detail), one run in flight, best-effort, redact secrets, record usage via recordOneShotSession.
- Persistence today rides needs_input frontmatter; done errors live elsewhere, so decide where the sentence is stored and make sure it clears with the error and on retry.
- Add tests alongside src/ui-app/tests/debug-tldr.test.ts.

## Activity

- 2026-09-30T03:02:23Z · created · unknown
