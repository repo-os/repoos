## TL;DR

Task 1264 was a headless QA sweep of the task drawer's tabs at 375/768/1280 px. The layout held at every width; the real bugs were state handling — failed loads that never resolved, empty-state copy shown during loading, and a possible `NaN:NaN` in the Tokens tab. The fix added a per-task failure map to the repo store, three-state rendering (loading / error with Retry / real empty) in the Changes, Review and Tokens tabs, and a NaN guard on the elapsed-time formatter, plus a new table-driven store test. One engineering round, one review pass (`good to go`), merged as `c2b7fa0` with `release:success`.

## Outcome

The drawer's Changes, Review and Tokens tabs now distinguish loading, failure and empty instead of collapsing them:

- A failed load previously left the Changes tab on "Loading changes…" forever and showed empty-state copy on Review ("No agent review for this task yet.") and Tokens ("No token or usage data yet.") while data was still in flight or after it had failed. The four best-effort loaders (`loadDiff`, `loadDiffStats`, `loadReview`, `loadTaskUsage`) now record success/failure per kind per task in the store (`drawerLoadFailed` / `setDrawerLoad` / `drawerLoadFailedFor`), and the drawer renders a distinct error state with a Retry button that calls the same loaders.
- Empty copy is now gated on a loaded result and only shows for a real, loaded-empty case.
- `fmtElapsed` treats a non-finite total as 0:00, so no payload can print `TIME NaN:NaN` (the trigger was a fixture `stats: {}`; the production server always sends `accumulatedMs`, so this was a defensive gap, not an observed production bug).

Files: `TaskDrawer.vue` (+53/−5), `stores/repo.ts` (+26/−1), new `drawer-load-failure.test.ts` (+142). The scratch QA harness under `src/ui-app/.qa-scratch/` was deleted before handoff.

Final verdict: review pass 1 returned `good to go` (evidence-gap-only: no committed capture of the new states), the branch merged cleanly, and the task closed with `release:success`.

## Process stats

- **Wall clock, created → done:** 02:27:21Z → 08:43:28Z on 2026-11-20 = 6h 16m 07s.
- **Rounds:** 1 engineering round, 1 review pass.
- **Engineer:** agent `engineer`, model `haiku` (Claude Code runner), started 02:27:36Z, elapsed 2950s, 54,439 tokens, cost $0.89432779, finished.
- **Reviewer:** agent `reviewer`, model `opencode-go/glm-5.3-flash`, started 03:38:08Z, elapsed 242s, 66,737 tokens, cost $0.04683393, finished.
- **Routing:** "Model router (jev)", model unknown, 0s elapsed, no tokens/cost recorded.
- **Restarts, pauses or model swaps:** none recorded.
- **Token/cost totals (engineer + reviewer):** 121,176 tokens, $0.94116172; the routing session contributed nothing recorded.
- **Close-out gate:** completed in 2368s at 08:42:34Z.
- **Handoff evidence:** 1 auto shot captured with a clean console (03:37:58Z); browser console-error check passed at 03:37:44Z.

## What went wrong

- **First sweep pass flagged 59 items — nearly all one false positive.** The drawer's left-edge resize grip intentionally sits outside the drawer box; `.drawer-resize` was excluded from the overflow heuristic and the remaining findings were the real state bugs. Resolved.
- **Store test failed with `window is not defined`** when run via the root vitest config, because the store reads `window.location` at setup. Fixed by running with the UI config (`bunx vitest run --config src/ui-app/vite.config.ts`); all 24 cases then passed. Resolved.
- **`repoos check` reported the test step as skipped** (the suite runs on the remote validation runner), so the engineer ran the drawer, store and handoff-related UI tests locally: 23 files / 240 tests, then 3 further files / 172 tests. Resolved by local verification.
- **Two CTO nudges (02:46:58Z, 03:18:54Z) were held** with reason "handoff gate is running". No action required; handoff completed at 03:38:02Z.
- **A queued message went overdue:** a message was queued at 02:47:19Z (another at 03:38:02Z), and at 04:45:33Z the log records `message_overdue` — still queued after 60m without delivery. The record does not state a resolution; the task nevertheless proceeded to a normal close-out.
- **Unexplained gap between verdict and close-out.** The review verdict landed at 03:42:11Z but the task only reached done at 08:43:28Z. The close-out gate's own recorded run was 2368s ending 08:42:34Z, which does not account for the earlier hours; the overdue message above is the only intermediate signal in the log. Cause not recorded.

## Learnings

- **Best-effort loaders erase the one fact a view needs.** Swallow-and-continue keeps the board alive, but the tab can't tell "still loading" from "failed". Record the load outcome beside the data (a side map, not a `null` sentinel that changes ref types) so the view can branch. Durable enough for `docs/agent-ui-and-preview-conventions.md`.
- **Empty-state copy must be gated on a loaded flag.** "No data yet" shown during an in-flight request reads as a real answer, and users believe it. Same doc as above.
- **Overflow-only sweeps find nothing when the bugs are in state.** At all three widths the layout was sound; the pane-text-per-mode dump is what caught the wording and state bugs. Worth noting in the UI conventions doc as the recommended sweep shape.
- **UI store tests need the UI vitest config**, because the store touches `window.location` at setup; the root config fails them with `window is not defined`. Candidate one-liner for `docs/agent-debugging-and-incidents.md`.
- **Evidence gap on state-only fixes:** failure and pending states can't be reproduced by the managed preview, so no shot was declared and the three-width walk rests on the report. The reviewer's suggestion — a `state` fixture that seeds a failed-load store entry so an error state can be captured — is the cheap way to close this class of gap next time.

## Follow-ups

None — no new tasks were filed (Linked tasks: none recorded). Open items noted in the round report, all declared out of scope for 1264: the Debug tab still shows "No debug events yet." while its events load; `loadMergeConflict`/`loadLandable` consumers stay silent on failure; focus visibility was checked only on the first Tab target, not every drawer control.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
