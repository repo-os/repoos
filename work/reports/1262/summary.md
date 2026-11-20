---
id: summary
title: summary
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: ""
---
## TL;DR

Task 1262 was a QA sweep of the Checks page (Now/Runs tabs, check plan, history, failure details) at 375/768/1280 px. One engineering round shipped a new headless-WebKit overflow audit plus fixes for the real defects, which turned out to be in error/empty states rather than layout: a failed local-slots load reading as "no slots in use", a failed plan load with no retry, a failed history load claiming "No recorded runs yet", keyboard-unreachable scrollers, and a mis-styled pipeline slot block. Review pass 1 found a CSS-specificity bug in the new error line; it was fixed and verified with computed-style assertions. Review passes 2 and 3 returned `good to go` (both flagged stale handoff captures), the branch merged as `f2dd45a7b595b3b563f0c4fc3baba00f8602aa1f`, and the task closed as `done` with `release:success`. Total wall-clock from creation to done was 7h 6m 13s. The run was rocky: three engineer turns ended without handoff, one flaky rendered-contrast audit, a watchdog intervention, one failed handoff for a missing engineering-report draft, and a review message stuck queued for over 60 minutes.

## Outcome

The Checks page now behaves correctly at 375, 768 and 1280 widths and no longer lies in its failure states. Shipped:

- **New QA harness:** `src/ui-app/tests/checks-page-qa-browser.test.ts` (+417 lines) mounts the real `ChecksView` in jsdom, renders its markup and compiled scoped CSS in headless WebKit with the built global stylesheet, and asserts every visible element stays inside the viewport at all three widths. Fixtures cover long step names/commands, a wedged local slot with a long hostname, a failed run with long test names, and four state cases. No live server was used (managed agents may not run `repoos serve`).
- **Failed local-slots load no longer reads as "none".** `ChecksView` previously cleared the holder list on any error. It now tracks loaded/failed state: "checking" before the first read, an alert plus retained last-known holders on failure.
- **Failed plan load gained a "Try again" button** that re-runs `load`.
- **Failed history load no longer shows "No recorded runs yet" alongside the error.** The empty message is gated on `!error`; the `check-runs-panel.test.ts` assertion that pinned the contradictory pair (from #0950) was updated on purpose.
- **Queue rows use a `.ck-queue-row` class** instead of a `.ck-local-slots > p:not(:first-of-type)` sibling selector that restyled error/notice lines.
- **Scrollable regions (step command, step output, both history tables) got `tabindex="0"`** so keyboard users can reach them.
- **The close-out pipeline's local-slot block is styled** with the same divider and label treatment as the queue row (content left in place; removing the duplicate is a product choice, and `checks-live-run-responsive.test.ts` asserts on it).
- **Review-round-2 fixes:** `.ck-local-slots > .ck-err` / `.ck-slot-notice` rules raise specificity above the container's `.ck-local-slots > p { color: var(--txt-dim) }`, so error and notice lines render red/green (pinned by computed-colour assertions against the `--red`/`--green` tokens at all three widths), and negative queue waits clamp to `0ms` via `Math.max(0, …)`.

Final verdict: review pass 3 `good to go`; task `done`, `release:success`, merged commit `f2dd45a7b595b3b563f0c4fc3baba00f8602aa1f`.

## Process stats

- **Engineering rounds:** 1 (Round 1, reported 2026-11-20T04:16:17Z), plus uncommitted round-2 fixes made after review pass 1 and handed off in a second pass.
- **Review passes:** 3 — pass 1 `needs some work` (2026-11-20T04:18:45Z), pass 2 `good to go` (04:55:00Z), pass 3 `good to go` (06:08:15Z). Two successful handoffs to review (04:16:19Z, 04:53:15Z).
- **Wall-clock:** created 2026-11-20T02:26:53Z → done 09:33:06Z = 7h 6m 13s. Close-out gate itself completed in 998s (09:31:20Z). The log records no activity between 06:08:15Z (pass 3) and 09:31:20Z (gate completed); the reason for that gap is not recorded.
- **Agents and models:**
- Engineer: `haiku` via Claude Code — one session, started 02:27:05Z, elapsed 5513s (1h 31m 53s), 73,003 tokens, cost 7.1882942. No restarts or model swaps recorded (a `cli_override, model_override` event is logged at creation time 02:26:59Z, but its details are not recorded).
- Reviewer: `opencode-go/glm-5.3-flash` — three sessions: 137s / 59,556 tokens / 0.03336406 (pass 1); 88s / 48,678 tokens / 0.0197895 (pass 2); 52s / 38,694 tokens / 0.01269983 (pass 3).
- Routing: "Model router (jev)", model unknown, 3 sessions, 0s each, no tokens/costs recorded.
- **Token/cost totals** (sum of the recorded figures above): 219,931 tokens; cost 7.25414759 — of which the engineer session accounted for 73,003 tokens and 7.1882942, and the three reviewer sessions together 146,928 tokens and 0.06585339.

## What went wrong

- **Flaky rendered-contrast audit.** The scoped check failed across three runs on two different Settings descriptions, passing on one re-run with nothing changed. The engineer treated it as a flake rather than a code defect and kept working; the task was handed off at 04:16:19Z after a passing run. Root cause was not diagnosed and is not recorded.
- **Three engineer turns ended without a handoff signal:**
- 03:31:21Z — ended deliberately (exit code 143) to let a queued message be delivered; the turn's last message also records that handoff had failed twice with an error beginning "reused check inp…" (truncated in the log; full text not recorded).
- 03:52:53Z — clean exit while the scoped check was failing (the contrast flake above).
- 04:43:56Z — clean exit; round-2 fixes were on disk but unverified because the worktree was locked against edits mid-review. The engineer stopped rather than working around the lock.
- **Watchdog intervention.** At 04:24:01Z the watchdog auto-surfaced the stuck task (agent exited without emitting `::repoos-handoff-ready::`); handoff was requested via CLI at 04:24:06Z.
- **Orphaned run process** stopped at 04:16:26Z (pid 70143, bun, ~47s old, cpu 1s).
- **Failed handoff at 04:45:36Z:** "Engineering report draft is missing: `.repoos/engineering-report-drafts/1262.md`". The task then moved to review at 04:53:15Z.
- **CTO nudges held repeatedly** — five times, for "handoff gate is running" or "an undelivered message is already queued".
- **Stuck queue message.** A message queued at 05:02:38Z was flagged overdue at 06:03:55Z after 60m undelivered; there is no `message_delivered` entry for it in the log.
- **Shot capture cancelled** at 04:55:05Z ("browser capture cancelled"). Review passes 2 and 3 still verdicted `good to go` but explicitly `STALE-EVIDENCE-ONLY`: both captures were taken at tree `ee5f8011a5`, before the final WIP commit (`35df71fe8` — the colour-specificity rule and queue-wait clamp) and the main merge (`426d12a9a`). Both passes judged the delta invisible in the two shot fixtures but requested re-capture; the log records no re-capture.
- **Shot label mismatch** (flagged in all three passes): declared shot 1 says "at phone width" but was captured at desktop width (`viewportWidth: null`). Not corrected per the record.

## Learnings

- **Error and empty branches need the same scrutiny as the width sweep.** An overflow audit passes easily on a page that wraps well; every defect this QA pass shipped was in a failure/empty state, and the new audit's first run failing exactly on the state cases (and none of the nine overflow cases) confirmed the split. Worth a line in `docs/agent-ui-and-preview-conventions.md`.
- **A `catch` that empties a list turns failure into a false claim.** Track "loaded" and "failed" as separate state instead.
- **Container-wide sibling selectors out-specify status classes.** `.ck-local-slots > p` (0,2,1) beat `.ck-err` (0,2,0), silently dimming error/notice lines — including pre-existing ones. Raise specificity for status colours inside such containers (or avoid colour-setting container rules). Same family as the existing `:first-of-type` lesson: a class is the stable hook, not sibling position. Belongs in `docs/agent-ui-and-preview-conventions.md` alongside the tooltip/styling rules.
- **A test can pin a defect.** The #0950-era assertion in `check-runs-panel.test.ts` encoded the contradictory "error + no runs" pair; before treating a failing assertion as a regression, check whether it encodes old behaviour — and update it deliberately when it does.
- **The repo's existing debugging guidance covers this run's shape** — a check that flips between different failures and passes unchanged across re-runs is a flake judgement call; `docs/agent-debugging-and-incidents.md` and `AGENTS.md`'s "Is a `repoos check` failure a flake?" section already say this. No new rule needed, but this task is a concrete example: the contrast audit's root cause was never found, only routed around by re-running. If it recurs, it deserves its own investigation.
- **Stale-evidence close-out is a gap.** Both final review passes flagged the handoff captures as stale and requested re-capture; the capture was cancelled and never redone, yet the task landed. If re-capture on the final tree is meant to be mandatory (as the protocol language implies), that enforcement belongs in the handoff gate, not reviewer suggestions.

## Follow-ups

None — no linked tasks were filed. For the record, reviewers suggested two items that were never filed as tasks: extracting the pre-existing native `title=` tooltips in `CheckRunsPanel` into a styled-tooltip task, and re-capturing/re-labelling declared shot 1 (labelled "phone width", captured at desktop width) on the final tree.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
