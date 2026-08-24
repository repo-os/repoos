---
id: "0269"
title: "Preview start: unreliable, unhelpful errors, no loading indicator"
type: bug
status: inbox
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
model_override: default
pm_model_override: deepinfra/deepseek-ai/DeepSeek-V4-Pro-0813
created_at: "2026-08-24T15:55:33Z"
updated_at: "2026-08-24T17:52:36Z"
---
## Problem

Clicking "Start preview" on a reviewed task can fail with an unhelpful, generic error — "preview server for #NNNN did not become ready" — with no detail on *what* failed (build? port? spawn? health timeout?) or what the human should do next. Swallowing that detail makes the failure feel random and unfixable from the UI.

Separately, clicking the button gives zero feedback for ~10 seconds (the full `HEALTH_TIMEOUT_MS` wait) before anything visibly changes — the button neither disables nor shows a spinner, so the user assumes the click didn't register.

## Root cause (investigate + fix; findings so far are from `src/server/preview.ts`)

Preview start is a long pipeline with several non-obvious failure points, and the current code collapses them all into one opaque message *or* misreports the cause:

1. **The "did not become ready" timeout is the one-size-fits-all error.** `doStart` (preview.ts:324) waits a fixed `HEALTH_TIMEOUT_MS` (10s) for `/api/health`, and on timeout reports only "did not become ready". It does NOT distinguish:
   - a **build** failure/slowness during `ensureFreshBuild` (preview.ts:154 — this can take up to `BUILD_TIMEOUT_MS` = 240s via `spawnSync`, and the error *is* returned there, which is at least semi-actionable),
   - a **spawn** failure (bad `process.execPath`, CLI entry missing),
   - a **port** in use / `waitForHealth` hitting a *different* server already on that port (health returns 200 but from the wrong process),
   - the child **crashing on boot** (today only its last stderr line lands in `bootErrors` and is lost on `exit` — the `exit` handler clears `bootErrors` before the timeout handler reads it, so the most useful diagnostic is thrown away).
2. **`bootErrors` is cleared by `child.on("exit")` (preview.ts:471) before the timeout reads it.** A preview that crashes during the 10s window loses its stderr — the exact info that would explain the failure.
3. **`waitForHealth` counts HTTP 200 from *anything* on the port.** If a stale/orphaned process (or an unrelated app) is already listening on the reserved port, `waitForHealth` returns true and we record a "healthy" preview that is actually the wrong server. `reservePort` closes the socket before the child binds, so there is a TOCTOU window.
4. **The only stderr capture is `bootErrors` (one line per task, overwritten).** No log file, no full boot output, nothing to inspect after the fact when a preview fails ~10s later.

The "unreliable" symptom is very likely (2)+(3) interacting with (1): a child either crashes early (stderr dropped) or binds to a port that momentarily returns a foreign 200, and in both cases the surface error is the vague timeout text.

## Fix

### Server (`src/server/preview.ts`, `src/server/routes/tasks.ts`)
- **Return specific, actionable errors.** Enrich `doStart` so each stage returns a distinct `PreviewResult.error` naming the stage and next step, e.g.:
  - build: `build failed before previewing — run 'repoos check' in the worktree; <last-error>`
  - spawn: `could not launch the preview process (<path>/<execPath>) — is the CLI built? run 'bun run build'.`
  - health timeout: include the **captured boot stderr** and the port, e.g. `preview on :PORT did not become ready — child exited with <stderr tail>; see the server log`.
- **Stop dropping stderr.** Keep a per-task boot buffer (ring buffer of the last N lines, not a single overwritten line) and do NOT clear it in the `exit` handler; only clear it once a preview is successfully started or a new start begins for that task.
- **Distinguish "not ready" from "wrong server".** Have the spawned child echo a unique nonce/marker (e.g. pass `REPOOS_PREVIEW_NONCE` env and have the child report it on `/api/health`, or verify `/api/health` returns the child's expected process identity) so `waitForHealth` can reject a foreign 200 instead of silently accepting it. At minimum, log a warning when the ready process's PID/command line does not match the spawned pid.
- **Tighten the port race** (optional but recommended): prefer passing the port to the child via a known-free mechanism, or retry `reservePort`+spawn once on an immediate non-ready crash rather than surfacing a timeout.
- Surface the full error string through the existing route (`routes/tasks.ts:872` already returns `result.error`); ensure no truncation of the actionable part.

### UI (`src/ui-app/src/components/TaskDrawer.vue`, `src/ui-app/src/stores/repo.ts`)
- **Immediate loading indicator.** When `startPreview` (and `stopPreview`) is clicked, show a spinner/disabled state *immediately* (`previewBusy` is already tracked — use it, or a dedicated `previewStarting` ref — to render a spinner inside the Start/Stop button and/or a "Starting preview…" label), and disable the button while in flight so the ~10s wait has visible feedback.
- **Show the actionable error inline** near the preview control (not only a transient toast), so the user sees "what failed and what to do" and can retry. The `result.error` from the POST body already flows through `repo.onError` via `api()`; render it persistently near the button.

### Tests
- Add/extend server tests (pattern: `src/ui-app/tests/auto-preview.test.ts`) covering: build-failure error is specific; child-crash-during-boot returns stderr, not a bare timeout; foreign-200-on-port is rejected/detected.
- Add a UI test asserting the spinner appears immediately on click and clears on completion/failure.

## Acceptance criteria
- A failed preview start tells the user *what* failed and *what to do*, never the bare "did not become ready".
- A preview that crashes on boot surfaces its actual stderr, not a timeout string.
- Clicking Start preview shows a spinner within one frame and disables the button until the request resolves.
- Errors render inline next to the preview button and are retryable.
- `repoos check` passes.

## Notes
- Zero runtime deps constraint holds: use `node:child_process`/`node:fs` only — no new runtime packages.
- Previews are server-owned; do not `repoos serve` yourself. Verify UI via the managed-preview signal (`::repoos-preview-request::`) and read the probe result from the transcript.

## Activity

- 2026-08-24T17:52:36Z · body
