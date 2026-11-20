---
task: "1276"
pass: 1
at: "2026-11-20T10:10:42.811Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/close-out-validation-log-should-show-liv
state: ok
tree_identity: "7b97e933d:7d1a69a7e2"
---
## Verdict
`needs some work` — retry reason is plumbed but never rendered, and no capture shows the new card/drawer labels.

## Relevance
`still relevant` — nothing on main has solved the live-progress problem; #1258's 55-minute silent close-out is exactly what this fixes.

## Evidence
- The single auto capture (`default-1.png`, route `/`) shows the idle Mission Control dashboard — no close-out running, so the new labels (`step · host · attempt`, `stalled · no progress`) appear nowhere. The card/drawer criterion is covered only by unit tests on the copy helper, not by a rendered component. Re-capture with a state fixture that renders an active (ideally stale) attempt.

## Bugs
- **Class: unwired snapshot field (claimed UI surface not implemented)** — `previousFailure` is carried end-to-end (`integration-job.ts` → `routes/tasks.ts` → `integration-status.ts` → `types.ts`) but no UI component or copy helper reads it (grep of `src/ui-app/src` finds it only in `types.ts`). The spec's Desired UX says a retry is "shown as a new attempt with its reason" and the TL;DR claims "a retry shows the reason the previous attempt failed" — the attempt number shows, but the reason is API-only. Either render it (e.g. in the card title/drawer when `attempt > 1`) or correct the report/docs claim to "exposed via the API".
- Class sweep checked: all five new job fields are added to `readJob` (none silently dropped); `progressLogPath` is likewise API-only but the report only claims the API returns it, so acceptable; no other snapshot field of this branch is dead. Class instances searched: `src/ui-app/src` (all), copy helpers in `integration-pipeline-ui.ts`, `TaskCard.vue`, `TaskDrawer.vue`, `IntegrationStatusBar.vue`, `PipelineView.vue`, server callers of `previousFailure`.

No further findings of this class were found after grepping: `src/ui-app/src/**`, `integration-pipeline-ui.ts` consumers, `TaskCard.vue`, `TaskDrawer.vue`, `IntegrationStatusBar.vue`, `PipelineView.vue`, `readJob`/`writeJob` sites in `integration-job.ts`.

## Edge cases
- Recorder persists `step`/`lastProgressAt` up to one await-tick after the `failed` phase write (timer vs `finally`) — harmless today (routes exclude failed), but a `lastProgressAt` on a failed record is mildly misleading.
- SSE gap: recorder writes reach the job record but nothing emits `integration` on them; step/host/attempt reach the UI only on existing stage/heartbeat emitters, so during a quiet remote run the host context can lag minutes.
- `previousFailure` persists on a `done` record — harmless, snapshot only surfaces active jobs.

## Suggestions
- Emit `integration` from the recorder's `setStep` (or a light throttle) so step/host/attempt arrive without waiting for stage events.
- Docs snippet for `previousFailure` is accurate; just align the TL;DR wording.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T10:05:07.565Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

