---
id: "0858"
title: "Investigate leaked repoos-* tmp fixture dirs ([global-reap] warning)"
type: feature
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: the agent process exited with an error — open the task to see the full output
priority: p3
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/investigate-leaked-repoos-tmp-fixture-di
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-19T19:04:41Z"
updated_at: "2026-10-19T19:47:39Z"
dev_error_count: 1
---
## Problem
During a full local `bun run test` bulk pass (2026-10-20, task #0843 session), the test harness printed:

`[global-reap] removed 74 stale repoos-* fixture dirs from the tmpdir — a test is likely leaking.`

The wrapper reaped them, but 74 leaked dirs means at least one suite creates fixture dirs it never cleans up (mkdtemp without afterEach rm, or a crashed worker mid-suite). Under pool contention a leaking fixture can also break a later run that assumes a clean tmpdir.

## Desired UX
The full suite leaves ~zero stale repoos-* fixture dirs behind; the [global-reap] warning either never fires or fires on a handful of dirs after a crashed worker.

## Acceptance criteria
- Identify which suite(s) leak (the warning's advice: `ls "$TMPDIR" | grep '^repoos-' | sed 's/-[A-Za-z0-9]\{6\}.*//' | sort | uniq -c | sort -rn`).
- Fix the leaking fixture cleanup (afterEach/afterAll rm or try/finally around the worker body).
- A full bulk pass completes without the [global-reap] warning (or documents the expected residual).

## Notes for AI
Repro: run `bun run test` on a loaded machine; the warning prints after the bulk pass. Suspects: suites using mkdtempSync under src/ui-app/tests (remote-host-pool, remote-validation) — both are subprocess-heavy and run long.

## Activity

- 2026-10-19T19:04:41Z · created · njachowski@gmail.com
- 2026-10-19T19:18:47Z · status inbox→ready
- 2026-10-19T19:18:50Z · status ready→active, branch
- 2026-10-19T19:25:29Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-19T19:46:35Z · cli_override, model_override
- 2026-10-19T19:46:36Z · model_override
- 2026-10-19T19:47:39Z · body
