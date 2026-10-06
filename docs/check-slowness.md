# Slow check / close-out detection (#0720)

Field report: on 2026-10-06 remote validation was far slower than normal for
hours (multi-minute bundle uploads, local gates over 30 minutes) and nothing
in the product surfaced it until a human asked. The data already lived in
`.repoos/checks.db` (`check_runs.duration_ms`, phase, remote, scope).

## Behaviour

While a run is **in flight**, the server:

1. Collects **running** jobs from `TaskCheckManager` (local handoff / merge-gate)
   and `RemoteValidator.activeRemoteRuns()` (remote handoff, close-out, release,
   with live `stage`, `uploadBytes`, `uploadSeconds` when the runner reports them).
2. Loads recent **history** from the check store (passing runs only for the median).
3. Runs pure logic in `src/core/check-slowness.ts`:
   - `evaluateSlowness` — one attention item per run above
     `attention.slowRunMultiplier × median` (default 1.5, min 5 samples).
   - `persistentSlowNotices` — when 3+ of the last 10 runs of a kind were slow.
4. Feeds flags into `buildAttentionFeed` (`slowRun`, `slowRunsRecently` kinds)
   and `GET /api/attention`.

Elapsed time for in-flight runs uses **server-side** `startedAt` and
`effectiveElapsedMs` with the task watchdog's awake clock (#0678) — not client
timestamps or agent output.

## UI

- Bell / notices store: `slowRun` items are re-snapshotted each poll (not
  accumulated); `slowRunByTask` drives task card and drawer badges.
- Remote runners API annotates active rows with `slow` via `annotateHostSlowRuns`
  in `server.ts`.

## Configuration

`attention.slowRunMultiplier` in `repoos.toml` (Settings → General). Must be
≥ 1.

## Tests

Unit tests: `src/ui-app/tests/check-slowness.test.ts` (thresholds, per-kind
medians, sleep credit, persistent notice). Attention mapping:
`src/ui-app/tests/attention-feed.test.ts`.
