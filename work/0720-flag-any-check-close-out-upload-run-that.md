---
id: "0720"
title: "Flag any check/close-out/upload run that exceeds 1.5x its own median, in the UI and the attention feed, while it is still running"
type: feature
status: active
priority: p1
area: [server, web]
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/flag-any-check-close-out-upload-run-that
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T14:26:00Z"
updated_at: "2026-10-06T17:08:46Z"
dev_error_count: 2
---
## Problem

On 2026-10-06 the remote validation path was far slower than normal for hours (bundle uploads of 9-41 minutes, local gates over 30 minutes, 36 of 43 failed runs were 'ssh upload of candidate bundle failed') and nothing in the product said so. The human had to notice and ask. Data was already there: .repoos/checks.db check_runs has duration_ms and phase/remote/scope for every run. Typical medians since 2026-10-05: close-out remote ~285 s, pre-review remote ~290 s, local full ~432 s. 29% of pre-review remote runs exceeded 1.5x the median; the worst was 5046 s.

## Desired UX

- While a check, handoff gate, close-out stage or bundle upload is RUNNING, compare its elapsed time with the rolling median of recent PASSING runs of the same kind (phase + remote + scope, e.g. last 30 runs, minimum 5 samples). When elapsed exceeds 1.5x the median, raise one attention item ('slow run') that says: what is slow, elapsed vs typical, which host, and the likely cause when known (upload phase vs test phase, host load, laptop asleep/swapping).
- The same flag shows as a badge on the task card / close-out progress and on the Remote runners tab for the host in question, so it is obvious without opening logs.
- Report the phase that is slow: bundle upload, install, build, tests. Log bundle bytes and upload seconds if available.
- Quiet by design: one item per run, auto-cleared when the run ends; a persistent 'runs are slow lately' notice when 3+ of the last 10 runs of a kind were slow, naming the common factor (same host, same hour, upload failures).
- A setting for the multiplier (default 1.5) in Settings (every user-facing toml feature needs a Settings control).
- Sleep-aware: reuse the awake-time logic from #0678 (effectiveStalenessNow) so a sleeping laptop does not count as slowness.

## Acceptance criteria

- Tests: a run at 1.4x median raises nothing; at 1.6x raises exactly one item and clears when it finishes; fewer than 5 samples raises nothing; medians are per phase/remote/scope; sleep gaps are excluded; the persistent notice appears at 3 of 10.
- Settings control + docs (docs/ and user-docs/check.md). repoos check passes.

## Notes for AI

Read src/server/attention-feed.ts and attention-notify.ts (silent-run items), src/core/agent-run-health.ts (effectiveStalenessNow), src/core/check-store.ts (check_runs), and the Remote runners panel (RemoteRunnersPanel.vue). Do not scan raw agent output for any of this. Related: #0717 (smaller uploads), #0719 (stuck timer shows turn start instead of last output; do not copy that bug: use server-side timestamps).

## Shots
```json
[
  {
    "label": "Slow-check multiplier in Settings",
    "target": "default",
    "route": "/settings?tab=general",
    "highlight": "#setting-attention.slowRunMultiplier"
  },
  {
    "label": "Remote runners slow badge on active job",
    "target": "default",
    "route": "/agents?tab=runners",
    "highlight": ".rr-slow-badge"
  }
]
```

## Activity

- 2026-10-06T14:26:00Z · created · unknown
- 2026-10-06T14:26:08Z · cli_override, model_override
- 2026-10-06T14:30:13Z · status inbox→ready
- 2026-10-06T14:30:17Z · status ready→active, branch
- 2026-10-06T14:46:34Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-06T14:50:15Z · needs_input
- 2026-10-06T15:03:28Z · body: section Shots
- 2026-10-06T15:13:17Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-10-06T15:55:38Z · needs_input
- 2026-10-06T17:08:15Z · body
- 2026-10-06T17:08:46Z · body
