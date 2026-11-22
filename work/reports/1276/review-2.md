---
task: "1276"
pass: 2
at: "2026-11-20T13:20:32.346Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/close-out-validation-log-should-show-liv
state: ok
tree_identity: "ed8be8a25:ed8be8a25c"
---
## Verdict
`needs some work` — code is sound, but the branch conflicts with main in `src/server/integration-status.ts` and must merge main before landing; capture evidence gap noted separately.

## Relevance
`still relevant` — the 55-minute silent close-out (#1258) is unsolved elsewhere; #1272 touched the same file but did not add live attempt progress.

## Evidence
- The single auto capture (`/`, idle dashboard) shows no close-out running, so none of the new labels (`step · host · attempt`, `stalled · no progress`, retry note) appear. Not blocking (copy helpers are unit-tested, including retry/stale/host variants), but a re-capture with an active/stale state fixture would show the criterion rendered.

## Bugs
None found

Round-1 findings verified fixed: `previousFailure` is now rendered (`integrationRetryNote` appended in `integrationActiveCopy`, tests cover it); late heartbeats can no longer stamp terminal records (`progressWritable` guards `persist`); step/host changes push via `onChange` → `emitIntegration` in `server.ts`.

No further findings of this class were found after grepping: `readJob`/`writeJob` round-trip in `integration-job.ts`, all `getJob`/`updateJob` callers, other IntegrationJob serializers (only `getIntegrationJob` exists), `src/ui-app/src` consumers of `step`/`host`/`attempt`/`progressStale`/`previousFailure`, `integrationActiveCopy`/`integrationBarActiveTitle`, `progressWritable` call sites, and the full diff for bare `node`/`npm`/`npx` invocations (none).

## Edge cases
- **Merge conflict (server-verified, not re-run):** `src/server/integration-status.ts` conflicts with main — #1272 (landed since) restructured `buildIntegrationSnapshot` in exactly the region this branch edits (`lastProgressAt`, active-job selection, blocker fields, early return). Resolution is not purely textual: main now returns `active: null` until a job leaves the queue, so the branch's progress fields and the idle/stall math must be re-integrated into the new shape. Merge main into the branch and re-verify the snapshot tests together.
- While the job waits in the coordinator queue there is no recorder, so `step`/`lastProgressAt` are null and `progressStale` is false — correct, but the "queued for host slot" step only appears when the remote run itself is queued/locked, not during the orchestrator-level queue wait.
- If the remote run ends before the next local `reportStep`, the recorder keeps heartbeating the last remote step; harmless (log-only) and quickly overwritten.

## Suggestions
- Re-capture the shot with a state fixture rendering an active (ideally stale, attempt 2) close-out so the new card/drawer copy is visually evidenced.

## Could not verify (environment)
None.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T13:18:47.963Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

