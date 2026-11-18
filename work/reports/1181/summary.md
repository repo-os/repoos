## TL;DR

A hands-on QA pass over Stories, the Inbox-filtered Work queue, and the Agents last-run activity view at 1280px and 375px found no reproducible defect, no page-level horizontal overflow and no console errors, so no application code changed. The only shipped change is the QA record `docs/qa/2026-11-stories-inbox.md`. The pass went from creation to done in one dev round and one review pass in about half an hour of wall-clock time; the browser-tooling fallback (headless Chromium via Playwright instead of the computer-use browser host) was the only notable obstacle and did not block completion.

## Outcome

The task asked for a recent hands-on QA pass across three views that earlier QA tasks (per the task's own exclusions, #1157/#1170/#1173/#1178) had not covered: Stories, the Inbox status-filtered Work queue, and Agents activity (`agents:lastRuns`), at desktop (1280px) and phone (375px) widths, with no console errors.

What actually shipped is documentation only: a new QA record, `docs/qa/2026-11-stories-inbox.md` (+24/−0), committed on branch `feat/qa-pass-stories-inbox-and-agents-activit` and merged in commit `dac18bd64dc398a61572dbca7f1dd3c99e6e7c9f`. No application code changed and no new regression test was added, because the QA run surfaced no defect to fix — the engineer judged that a source change or test without a demonstrated problem would be speculative.

Specifically verified live against a worktree-local auth-less server (`just serve-noauth 7272`):

- All three routes (`/stories`, `/work?status=inbox`, `/agents?shotState=agents:lastRuns`) rendered at both widths with no document-width overflow and no browser console or page errors.
- At 375px the story panel opened as an overlay within the viewport; the Inbox quick filter accepted a P2 selection and updated the visible task count; an Inbox task drawer showed the phone task-detail layout (queue return/close, status selection, move action, human/input notices).
- The `agents:lastRuns` fixture exercised success, failure and previous-setup states; a failed run's failure reason and task-log link fit in the viewport.
- Stories' Hide Completed filter visibly changed the card count after the async list rendered.

Known limitation, recorded in the QA doc: the live pass could not exercise a genuinely empty Stories state (repo data was populated); that case remains covered by existing `stories-view.test.ts` component tests. The only 375px horizontal scrolling observed was inside the Work queue's quick-filter strip, which is deliberately an internal scroll region — not page overflow.

Final verdict: review pass 1 returned **good to go**, close-out completed, status done with `release:success`.

## Process stats

- Dev rounds: 1 (round 1, 2026-11-18T08:56:19Z). Review passes: 1 (pass 1, 2026-11-18T08:56:59Z, good to go). No restarts of the task itself; one orphaned engineer process (pid 10765) was adopted at 08:54:52.
- Wall-clock, created → done: 2026-11-18T08:49:05Z → 2026-11-18T09:19:24Z (≈ 30 minutes). The bulk of that was the close-out gate, which completed in 107s at 09:19:19; the active work itself ran 08:49:12 → 08:56:59.
- Agents and models (from the session table):
  - Engineer: agent `engineer`, model `gpt-6-luna`, 45s elapsed, 2,830,074 tokens, cost not recorded, finished. Two `routing` sessions (Model router via openrouter, model unknown, 0–1s) bracketed it.
  - Reviewer: agent `reviewer`, model `gpt-6-luna`, 38s elapsed, 135,357 tokens, cost not recorded, finished, plus a second routing session (1s).
- Cost totals: not recorded anywhere in the facts.
- Shots: skipped at handoff — the diff's 3 changed paths touched no capture target's globs (no UI change to capture).

## What went wrong

- **Orphaned engineer process.** Four minutes after start, the server noted it had adopted orphaned engineer pid 10765 (08:54:52). Resolution: adoption — the existing engineer session finished normally and produced round 1 on schedule; no restart or model swap occurred.
- **Computer-use browser host unavailable.** The engineer's intended browser tooling returned an "unavailable" error. Resolution: fell back to the Playwright package already installed in the worktree, driving a headless Chromium against the same worktree-local server; page errors, console messages, rendered document widths and screenshots were checked programmatically, and the fallback is noted in the QA record rather than presented as real-device results.
- **Timing race in the first QA probe.** The first list-count probe for the Stories Hide Completed filter ran before the story list finished async loading, so the count didn't move. Resolution: reran the interaction after the list rendered and the filter visibly changed the count. Judged a probe-timing artifact, not a product bug; no code change.
- No failed handoffs, flaky checks or gate failures: review passed on the first attempt, and the close-out gate completed cleanly in 107s.

## Learnings

- **The Work queue's quick-filter strip is intentionally a horizontal inner scroll rail at 375px** — evaluate it as a control rail, not page overflow. Worth a line in `docs/agent-ui-and-preview-conventions.md` so future QA passes don't re-litigate it as a bug.
- **The `agents:lastRuns` preview fixture is the cheapest way to exercise agent-run failure details** (failure reason, task-log link) without a real agent run — worth mentioning wherever preview fixtures are documented.
- **Live QA of empty states needs a dedicated browser fixture** when repo data is populated; component tests remain the fallback for empty/disabled Stories cases. If empty-state QA becomes recurring, that fixture is a candidate for a follow-up task.
- **Computer-use browser unavailability has a working fallback**: headless Chromium via the worktree's installed Playwright, with the limitation (not a real device) recorded in the QA doc. Could live in the QA conventions doc alongside the existing preview/browser guidance.

## Follow-ups

None recorded.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
