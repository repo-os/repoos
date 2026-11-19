## TL;DR

Task 1235 was a QA pass over the Work board's drag, status-move and bulk-action paths when the server rejects them (blocked move, dirty `main`, close-out conflict). It shipped one real defect fix plus a structural refactor: drag-to-Done rejections for a dirty checkout were completely silent on the board (no dialog, no toast), and the fix ended as a new app-level `CloseOutDialogs.vue` presenter driven by store records, covering every caller of `completeTask` rather than just the board column. The drop path and hover cue now share one `moveRejection()` validation. Everything is pinned by a committed QA suite (24 tests), a dialog-owner suite (7 tests), a committed QA doc with 7 rendered screenshots, and a rendered WebKit audit at 375/768/1280 px. Two engineering rounds and two review passes; review pass 2 returned **good to go**, the task is **done**, and the release merge succeeded (commit `e22bfd2`).

## Outcome

The pass exercised the board's rejection paths against fixtures and mocked rejections (headless WebKit + jsdom only, per the task's acceptance criteria) and fixed what it found:

- **Silent dirty-checkout drag rejection fixed.** `BoardColumn`'s drop handler routed `DirtyCheckoutError`/`WorktreeHandoffConflictError` to `repo.onError`, which deliberately swallows those two types because other surfaces open confirmation dialogs — leaving the board drag with no presenter at all. Round 1 gave the column its own dialog copies; the review showed that produced stacked duplicate overlays, so round 2 centralized presentation in `CloseOutDialogs.vue`, mounted in `App.vue`, rendering both dialogs from the store records `completeTask` writes before it throws. TaskCard, TaskDrawer and BoardColumn shed their copies; every caller of `completeTask` (including `Keep review & merge` on card/drawer/Debug panel and the integration bar's stalled-pipeline retry) now gets the dialog for free. The previously silent class — `keepReviewAndMerge` callers swallowing the dirty-checkout type — is covered and pinned by tests.
- **Drop/hover drift closed.** The drop path re-derived move-validity by hand and had drifted from the hover cue; a forced drop could reach a bare `setStatus` and surface only the server's technical 400. Both paths now share one `moveRejection()` and the same plain-English wording.
- **Store hygiene:** close-out decision records now clear on cancel/discard/send-back, on successful retry, when the task leaves `review`, and on success (an empty record previously persisted forever); one pending decision per task, conflict record shown first when both types pend.
- **Already-good paths pinned by tests:** blocked-move toasts, snap-back on server rejections, the dead-server message, the 45 s start-work watchdog, inline `DoneErrorCard` failures, and keyboard/touch alternatives.
- **Deliverables:** `docs/qa/2026-11-board-moves-failures-qa.md` with 7 committed `.jpg` screenshots under `docs/qa/assets/board-moves-qa/`, `src/ui-app/tests/work-board-moves-qa-browser.test.ts` (24 tests), `src/ui-app/tests/close-out-dialogs.test.ts` (7 tests), plus component/store changes (final round diff: `CloseOutDialogs.vue` added; `BoardColumn` −121 lines, `TaskCard` −126, `TaskDrawer` −143 of per-surface dialog code; `task-card-handoff-conflict.test.ts` deleted as superseded).

The task title's "bulk actions" map to the board's only bulk control ("Collapse empty columns"), which is local-only; the board has no multi-select (consistent with #1217's QA pass). The QA doc states this explicitly rather than inventing coverage.

Final verdict: review pass 2 — **good to go**; status **done**, release merge succeeded.

## Process stats

- **Wall clock, start to done:** created 2026-11-19T16:17:45Z → done 2026-11-19T18:51:26Z = 2 h 33 m 41 s. Close-out gate alone took 796 s.
- **Engineering rounds:** 2 recorded rounds (17:10:47Z, 18:13:33Z). Three `active→review` transitions (17:10, 17:45, 18:09); the 17:45 attempt flipped back to `active` within seconds while the handoff gate ran.
- **Review passes:** 2 — pass 1 `needs some work` (17:14:29Z), pass 2 `good to go` (18:13:33Z note; review session completed 18:11:44Z).
- **Agents/models:** engineer and reviewer both ran on `opencode` with `opencode-go/glm-5.3-flash`. The preferred `codex + gpt-6-luna` pair was paused (provider usage quota, paused since 07:09:32Z), so the run fell back to opencode + glm-5.3-flash; no mid-task swaps after that.
- **Restarts:** the watchdog restarted the engineer 3 times for queued messages waiting with no live process (3 m wait at 16:51:28Z, 3 m at 17:35:44Z, 14 m at 17:59:15Z). All three messages were then delivered and work resumed.
- **Tokens/cost (recorded sessions):** engineer 152,134 tokens / $0.12564389 (elapsed 1190 s); reviewer pass 1 69,677 tokens / $0.04513199 (221 s); reviewer pass 2 60,595 tokens / $0.03371057 (142 s). Recorded total 282,406 tokens / $0.20448645. Routing sessions recorded 0 s elapsed with no token/cost figures. Per-branch wall time across restarts is larger than the recorded session elapsed times; exact aggregate engineer wall time is not recorded.

## What went wrong

- **Agent fallback at start:** the default `codex + gpt-6-luna` pair was paused for provider quota; the run proceeded on `opencode + opencode-go/glm-5.3-flash`. Resolved by fallback, no action needed.
- **First full `repoos check` failed remote validation** on a single `vue-tsc` error (a conditional `true | undefined` in a stubs object). Fixed by building the stubs record explicitly; the re-run passed end to end.
- **Review pass 1 returned `needs some work`:** the round-1 per-surface dialog fix stacked two body-teleported overlays for one rejection (BoardColumn + TaskCard's store-seeded watcher), the card's copy could stay open with stale content after the record cleared, and the whole sibling class of `completeTask` callers stayed silent. Resolved by the round-2 `CloseOutDialogs` refactor; pass 2 verified all three findings fixed.
- **QA-doc overclaim:** round 1's doc said the rejection was "completely silent" and the fallback was "a toast" — the handoff-conflict type already opened the card's dialog pre-task, and no toast fires. Rewritten to match the mechanism.
- **Handoff staged-artifact guard failure:** two 1280 px PNG screenshots decompressed past the guard's 4 MiB zlib scan limit. Shots converted to `.jpg` (matching other committed QA shot dirs) and the harness writes `.jpg` so regeneration reproduces them.
- **Watchdog restarts ×3** (see stats): queued engineer messages waited 3 m, 3 m and 14 m with no live process; each restart delivered the queued messages and work continued. CTO nudges were held several times because a message was already queued or the handoff gate was running.
- **Edit tool refused a change to the new test file twice** (no reason given); the same edit was applied via a one-line shell substitution / perl one-liner and the file re-formatted clean.
- **Round-2 self-found bug while writing owner tests:** `completeTask` wrote an empty-files dirty record on success, which a record-driven owner would render as an empty dialog forever; the record is now deleted on success.
- **Minor warning:** one UI verification note recorded a "1 shot warning" (18:13:32Z); the verification still passed.
- **Noted gap, not fixed by design:** the 45 s start-work watchdog only arms after the server answers, so a request that hangs forever blocks rather than times out; changing it would mean a client timeout on every mutating endpoint. Recorded as a note in the QA doc, not a defect claim.

## Learnings

- **`repo.onError`'s early-return list is a contract with callers:** every rejection type it swallows must have exactly one presenter, or the rejection is silent. The durable fix pattern — derive presentation from a store record written before the throw, owned at app level — is embodied in `CloseOutDialogs.vue`; the "callers must present or the rejection vanishes" invariant deserves a line in `docs/agent-ui-and-preview-conventions.md` so future `completeTask`-like error paths don't repeat the bug class.
- **Deriving UI state from a store record beats multiple owners reacting to the same event** — fewer refs, no coordination, no stale dialogs, Escape stacking falls out for free. Round 1's three-place wiring was the wrong layer; the review caught it.
- **"Completely silent" needs precision in QA docs** — name which error type was silent and which already had a presenter; overclaims get caught in review and cost a round.
- **Board specifics worth keeping:** the board has no optimistic status writes, so snap-back is structural (assert it, don't trust it); TaskCard/BoardColumn and the two dialogs carry zero scoped styles, so QA fixtures only need the built global stylesheet; the board has no multi-select (also recorded by #1217). All four are captured in the committed `docs/qa/2026-11-board-moves-failures-qa.md`.

## Follow-ups

None — no linked tasks were recorded for this task. The hung-request watchdog gap and the human-assignee drag path (which bypasses `moveRejection` and toasts server 400s verbatim) are documented as pre-existing notes in the QA doc rather than filed tasks.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
