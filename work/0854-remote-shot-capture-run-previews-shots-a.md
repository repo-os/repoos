---
handoff_signal_retry_count: 2
id: "0854"
title: "Remote shot capture: run previews, shots and UI verification on a runner instead of the laptop"
type: feature
status: active
priority: p2
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/remote-shot-capture-run-previews-shots-a
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-19T14:24:21Z"
updated_at: "2026-10-20T04:39:01Z"
---
## Problem
Tests already run on Tailscale runners (docs/remote-validation.md), but everything browser-related still runs on the control-plane laptop: the per-task preview (`bun run build` with vue-tsc + vite, then `repoos serve`), Playwright/WebKit captures of declared and automatic shots, the handoff UI verification, `repoos shot` and `repoos verify`. With several engineers handing off at once this is the dominant local load (dozens of WebKit processes, repeated full UI builds, 20+ GB of memory pressure on 2026-10-18/19). `remoteValidation.offloadBrowserSteps` (#0836, default off) only moves the smoke and rendered-contrast gate steps, not shots or UI verification.

## Desired UX
Shot capture and UI verification can run on a runner:
- At handoff (and for `repoos shot` / `repoos verify`), when a runner with Playwright/WebKit is available, the control plane ships the task bundle (already done for tests), the runner builds the UI, starts the app in preview mode inside the runner's container, captures every declared and automatic shot and the UI-verification record using the same fixtures and step vocabulary, and returns the PNGs, `shots.json` and the verification record as artifacts. Results land in the same places (`work/.attachments/<id>/shots`, task activity) so the Changes tab and the reviewer see no difference.
- A Settings control (Performance) selects where browser work runs: `local`, `runner when available` (default once proven), `runner only`. Local stays the fallback and stays under the existing Playwright cap.
- The laptop no longer builds or serves a preview for routine handoff evidence; a human-requested interactive preview (the Preview button) stays local.

## Acceptance criteria
- A short written design in docs first: what the runner image needs (Playwright, WebKit, fonts), how the bundle/artifacts round-trip works, how fixtures and the dev-login/auth-less preview mode are handled, failure and fallback rules, and the security note (no secrets in the bundle).
- Tests with a fake runner transport: capture runs remotely and returns artifacts; a missing browser or a runner failure falls back locally with a visible note; declared-shot failures are reported exactly as local ones are (a missing target still fails the handoff).
- A real end-to-end proof on one runner (recorded in the task): a UI-visible task handoff captured entirely remotely, with the local machine's Playwright/WebKit process count unchanged.
- Settings control, docs/remote-validation.md and docs/previews.md updated.

## Notes for AI
Start with the design doc and a small spike: reuse `validate.sh`, the bundle upload and the artifacts channel from remote validation, and the existing shot planner (src/core/shot-plan.ts, src/server/shot*.ts). Depends on nothing but benefits from the preview-teardown fix (separate task). Do not touch repoos.toml. Source: Nick, 2026-10-19.

## Activity

- 2026-10-19T14:24:21Z · created · njachowski@gmail.com
- 2026-10-20T04:26:47Z · status inbox→ready
- 2026-10-20T04:26:50Z · cli_override, model_override
- 2026-10-20T04:26:54Z · status ready→active, branch
- 2026-10-20T04:39:01Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal

