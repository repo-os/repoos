---
id: "0374"
title: Preview start button gives zero feedback while a slow command boots
type: bug
status: review
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/preview-start-button-gives-zero-feedback
created_at: "2026-09-16T08:05:25Z"
updated_at: "2026-09-16T17:25:58Z"
---
## Problem

Clicking "Start preview" sets `previewBusy = true`, which only disables the
button (`TaskDrawer.vue`, the `startPreview`/`stopPreview` handlers and the
`:disabled="ui.saving || previewBusy"` bindings near the preview quickbar).
There is no spinner, no elapsed-time indicator, no "starting..." text — the
button just goes grey and stays that way until the request resolves.

For a fast target (a plain dev server — landing/docs in this repo, or most
external projects' preview commands) this is barely noticeable, sub-2-second
round trip. But #0370 made the readiness budget per-target/configurable
specifically because some commands legitimately take much longer (a build
step before serving). Reproduced live (2026-09-16): clicking preview on a
task whose command needed ~a minute to build+boot showed nothing but a grey
button the whole time — indistinguishable from a hang or a silent failure.
The user's own words: "it just went grey (the button) and there's no
indication of what's happening."

This will only get more common as more projects configure slower preview
commands (readyTimeoutMs exists now specifically to accommodate them), so the
UI needs to scale with that, not just the fast case.

## Desired outcome

While a preview start is in flight, show real progress, not just a disabled
button:
- Immediate "starting…" state distinct from steady-state disabled (the
  button disabling within one frame is fine and already covered by earlier
  work — #0269's acceptance criteria mention this — the gap is everything
  AFTER that first frame).
- Some sense of elapsed time or a busy indicator (spinner, elapsed seconds)
  so a 5-second start and a 3-minute start don't look identical to the user.
- If the backend has any incremental signal available during boot (stdout/
  stderr lines from the spawned command, e.g. `this.bootErrors` in
  `preview.ts` already captures stderr for the FAILURE case — check whether
  something similar could stream during a successful boot too, without
  overengineering a full log viewer for this task), surface it; if not
  currently available, decide whether adding it is in scope here or a
  follow-up.

## Constraints

- Don't touch preview resolution/timeout logic (#0370) — this is purely
  about the UI's feedback during an already-correct wait.
- Keep it lightweight: a spinner + elapsed-time text is enough; this is not
  a request to build a live log-tailing UI unless investigation finds that's
  trivial to wire from what `preview.ts` already tracks.

## Acceptance criteria

- [ ] Starting a preview shows an active, visibly-progressing state (not
      just a static disabled button) for the full duration of a slow start.
- [ ] A fast preview (sub-2s) still feels instant — no new artificial delay
      or flash of a loading state that outlives the actual wait.
- [ ] Verified against a genuinely slow command (this repo's own default
      `[preview] command` is a real one to test against, per #0370).
- [ ] `repoos check` passes.

## Related

- #0370 — made preview start times legitimately variable per project
  (readyTimeoutMs); this is the UI-side consequence of that.
- #0269 — covered the FIRST-frame spinner/disable; this task is about
  everything after that.

## Activity

- 2026-09-16T08:05:25Z · created · unknown
- 2026-09-16T16:55:25Z · status inbox→ready
- 2026-09-16T17:20:58Z · status ready→active, branch
- 2026-09-16T17:25:58Z · status active→review
