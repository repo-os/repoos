---
id: "0595"
title: Failure tl;dr for Move-to-done errors
type: feature
status: review
priority: p2
area: [server, web]
assigned_to: ai
created_by: ""
branch: feat/failure-tl-dr-for-move-to-done-errors
cli_override: cursor
model_override: composer-2.5
created_at: "2026-09-30T03:02:23Z"
updated_at: "2026-09-30T04:51:54Z"
last_check_failure: "repoos check at 2026-09-30T04:20:52.224Z: the worktree changed while the gate was running (HEAD moved from 08743609 to 23e6ec30) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
review_rounds: 2
review_passes: 2
---
The failure tl;dr (#0570, src/server/debug-tldr.ts) only runs for needs-input reasons (review-failed, dev-error, check-failed-after-retries, watchdog-stuck). A failed Move to done is stored as a done error (repo.doneErrorFor, rendered by DoneErrorCard.vue in the task drawer and on the board card) and never reaches that path, so the drawer shows no 'tl;dr — what happened' for it. MTD errors are common and hard for humans to read (e.g. #0589: a vitest failure buried in remote-validation output).

Goal: when a close-out fails at a diagnosable step (check/build gate, validation, merge conflicts), run the same one-shot Debugger distillation once and show the sentence (root cause + next action) on the DoneErrorCard, including in its collapsed one-line state.

Notes:
- Reuse DebugTldrManager gates: dedupe by fingerprint of (step, message, detail), one run in flight, best-effort, redact secrets, record usage via recordOneShotSession.
- Persistence today rides needs_input frontmatter; done errors live elsewhere, so decide where the sentence is stored and make sure it clears with the error and on retry.
- Add tests alongside src/ui-app/tests/debug-tldr.test.ts.

## Activity

- 2026-09-30T03:02:23Z · created · unknown
- 2026-09-30T03:28:49Z · cli_override, model_override
- 2026-09-30T03:28:51Z · model_override
- 2026-09-30T03:28:54Z · status inbox→ready
- 2026-09-30T03:28:55Z · status ready→active, branch
- 2026-09-30T03:37:06Z · status active→review
- 2026-09-30T03:47:09Z · status review→active
- 2026-09-30T04:00:16Z · status active→review
- 2026-09-30T04:07:39Z · status review→active
- 2026-09-30T04:35:13Z · handoff failed · check failed after 2 automatic retries · the worktree changed while the gate was running (HEAD moved from 4eaea8c9 to c0b3ce45) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable.
- 2026-09-30T04:49:37Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-30T04:51:54Z · status active→review
