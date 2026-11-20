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

Task #1259 added the missing desktop half of the work-board queue search: a search input on the board (720 px and up) that writes `q` to the URL using the same shared predicate and URL helpers as the phone queue (`src/ui-app/src/lib/workQueueFilters.ts`), with the existing chip bar and Clear filters behaviour unchanged. One engineering round and one review pass; the review verdict was `good to go` and the task landed as `done` with `release:success`. The main friction was a handoff-gate failure caused by an unrelated load-dependent flake in `agent-review.test.ts`, which passed in isolation and was left untouched.

## Outcome

The desktop work board now has a search control. Shipped in commit `e6ce5bb400dd1c81dc0604701d2350fe31c79eb3` on branch `feat/work-board-apply-queue-search-and-filter`:

- `BoardQueueSearch.vue` — a controlled input rendered only when the effective view is the board. The URL owns the value; a local draft keeps typing responsive and a watcher adopts values arriving from the URL (Back button, shared links). Clear removes only `q`.
- `workQueueFilters.ts` gained the helper `withWorkQueueSearch`, which sets or deletes only `q` while preserving all other query keys, including drawer params (`task`, `tab`) and the other quick filters.
- `WorkView.vue` renders the input in the non-narrow branch, so phones (<720 px) keep only the mobile queue's input — no duplicate controls. The pipeline view hides the box while the chip bar keeps its "filters not applied" notice.
- Filtering uses the shared `matchesWorkQueueFilters` predicate; no second parser was introduced, per the task's constraint.
- Tests: desktop-board cases in `work-filter-persistence-qa-browser.test.ts` (typing writes `q` and keeps other keys, URL-driven `q` reflects and filters, clear removes only `q`, box absent on pipeline); headless WebKit fixtures at 375, 768 and 1280 px asserting no horizontal overflow, an input wider than 120 px, and a visible clear control; helper coverage in `work-queue-filters.test.ts`.
- `docs/qa/2026-11-filter-persistence-qa.md` updated: the "no search input at 720 px" gap note now says `q` is written from the board, while the other quick filters are still set from the phone queue or a link.

Final verdict: review pass 1 returned `good to go`; the close-out gate completed and the task status became `done` with `release:success`.

## Process stats

- Status flow: created 2026-11-20T00:57:29Z (needs_input briefly at 00:57:30, resolved by body edits at 00:57:41), inbox→ready 01:42:04, ready→active 04:07:05, active→review 05:24:20, done 08:02:51Z. Wall-clock from creation to done: 7 h 5 m 22 s.
- Engineering rounds: 1 (Round 1, claude code, model haiku). Handoff attempts: one failure at 04:56:21Z, then a successful move to review at 05:24:20Z.
- Review passes: 1 (pass 1, opencode, model opencode-go/glm-5.3-flash), verdict `good to go`.
- Agent/model overrides: `cli_override` and `model_override` recorded at 01:42:10Z (details not recorded beyond the event names).
- Watchdog restarts: 1 (engineer restarted at 04:59:32Z). One orphaned run process stopped (pid 78960, age 30s) at 05:24:31Z.
- Sessions (from the recorded table):
- engineer · haiku · started 2026-11-20T04:07:45Z · elapsed 2563s · 43,172 tokens · cost 0.27354906 · finished
- reviewer · opencode-go/glm-5.3-flash · started 2026-11-20T05:24:42Z · elapsed 79s · 44,401 tokens · cost 0.01614646 · finished
- routing · Model router (jev) · model unknown · elapsed 0s · tokens/cost not recorded
- Token total (engineer + reviewer): 87,573. Cost total (engineer + reviewer): 0.28969552. Any cost outside these two sessions was not recorded.
- Close-out gate: completed in 193s at 08:02:35Z.

## What went wrong

- **Handoff failure at 04:56:21Z — remote validation failed on an unrelated test.** The gate reported a test failure in `tests/agent-review.test.ts` ("agent review before human sign-off (#0101) > routes reviewer chat to its own session and serves the conversation"), telling the engineer to fix it in the feature branch. The engineer recognised the test is about reviewer chat, untouched by this branch, ran it alone and as a whole file — all 17 tests passed both ways. It was judged a load-dependent flake (the test waits on a log-file count written by a fake reviewer process) and left untouched, with no widened timeouts. Resolution: re-attempted handoff succeeded at 05:24:20Z. The engineer noted explicitly: if the same test fails a gate again, that is a real timing problem to investigate separately.
- **Queued-message stall.** The failure message was queued at 04:56:21Z but not delivered; the CTO nudge was held at 04:57:27Z ("an undelivered message is already queued"), and at 06:27:03Z a watchdog flagged it `message_overdue` — still queued after 60m. It was finally delivered at 04:59:33Z after the watchdog restarted the engineer ("a queued message waited 3m with no live process").
- **Orphaned process.** At 05:24:31Z an orphaned run process (pid 78960, ~1s CPU, 30s old) in the task worktree was stopped automatically, right after the move to review.
- **Review evidence gap.** The reviewer's verdict was `good to go` but flagged EVIDENCE-GAP-ONLY: the single auto handoff capture showed the home page in a loading skeleton state rather than the search box, because the task declared no `## Shots`. The reviewer's suggestion was to re-capture on `/work` at a wide viewport or declare a `## Shots` entry; no re-capture is recorded in the log.
- **CTO nudges held** three times (04:42:22Z, 04:59:32Z-window, 05:09:24Z) while the handoff gate was running or a message was queued — expected back-pressure, not failures.

## Learnings

- **A task description can be stale by the time an agent picks it up.** The feature was already built in earlier commits on the branch; the round's real work was verifying it against the acceptance criteria and the gate. Durable phrasing for AGENTS.md or `docs/agent-workflow-rules.md`: "re-read the live branch state before assuming the task body reflects what's done" — this matches the existing "#0879 never act on memory" spirit but is about task bodies lagging branch state.
- **Flake triage rule held up and is worth recording where `docs/debugging-check-failures.md` lives:** a gate test that fails once, is untouched by the branch, and passes alone and as a whole file is a flake until it reproduces on an idle machine; running the file in isolation is the cheap disambiguator. The engineer did not widen timeouts or edit the test without a reproduction — that restraint is the part worth codifying.
- **Undeclared `## Shots` on a UI task weakens review evidence.** The only visual capture was a loading home page, so the reviewer approved on code reading alone with an evidence caveat. This reinforces the existing AGENTS.md rule that UI tasks should declare `## Shots` entries (route + viewport) at handoff; consider calling it out specifically for board/wide-viewport features.
- **Queue message delivery can lag well past its trigger** (delivered ~3m late via watchdog restart, then flagged overdue at 60m). The watchdog handled it; no new mechanism is proposed here.

## Follow-ups

None. No follow-up tasks were filed from this task per the recorded links. (#1257 is the pre-existing dependency — a QA pass on filter persistence — already `done`; the latent flake in `agent-review.test.ts` was deliberately left unfiled pending a second reproduction, so no task exists for it.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
