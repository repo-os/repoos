---
id: "0085"
title: Test one selected agent/model combination at a time
type: feature
status: done
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: feat/0085-test-selected-agent-model
created_at: "2026-08-11T10:34:53Z"
updated_at: "2026-08-11T11:58:54Z"
---
## Activity

- 2026-08-11T10:34:53Z · created · unknown
- 2026-08-11T10:36:00Z · spec fleshed out and status inbox→active · ai
- 2026-08-11T10:42:42Z · status active→review · implementation on
  feat/0085-test-selected-agent-model (fcf5e0c); `repoos check` green · ai
- 2026-08-11T11:12:50Z · review fix: reduced cloud probe timeout to 8s and
  moved Instructions below the agent/model/test control row (9e4b12c) · ai
- 2026-08-11T11:23:00Z · review fix: agent edits now auto-save after a debounce;
  removed the manual save bar and unsaved-changes prompt; `repoos check` green · ai
- 2026-08-11T11:33:54Z · review fix: Codex compatibility probes now bypass the
  trusted-directory preflight; real gpt-5.6-luna probe passed in 6.017s · ai
- 2026-08-11T11:37:16Z · review fix: decoupled compatibility testing from model
  discovery so Claude/Qwen probes run; real Claude default passed in 4.262s · ai


## Problem

Task #0083 added a global **Test models** action that tests every discovered model
for every configured CLI. On the current machine that means 81 real provider calls
(74 OpenCode + 7 Codex) from one click. This is expensive, slow, hard to interpret,
and broader than the user's intent: validate the exact CLI/model pairing assigned to
an agent before relying on it.

## Desired UX

Each default and custom agent card has its own compact **Test** action beside its
coding-agent/model controls. Clicking it tests only that card's currently selected
`cli + model` pair with the existing sentinel probe.

The action immediately changes to an inline spinner / **Testing…** state. When the
request completes, that same card shows a persistent success, failure, timeout, or
not-testable indicator with a concise diagnostic on hover or expansion. Changing the
card's CLI or model clears the stale result. Testing itself must not save or mutate
config. Agent edits auto-save after a short debounce; there is no manual Save button
or unsaved-changes prompt.

Remove the page-level bulk **Test models** button and matrix summary. Keep **Refresh
models** as the discovery action.

## Acceptance criteria

- [ ] Every default and custom agent card has a per-card Test action
- [ ] Clicking Test sends exactly one `{ cli, model }` combination to the server
- [ ] Only the clicked card enters a disabled Testing… spinner state; other cards
      remain usable and may be tested independently
- [ ] The card renders passed, failed, timed-out, or not-testable after completion
- [ ] A failed/timed-out result includes a bounded sanitized diagnostic
- [ ] Changing that card's CLI or model clears its previous result
- [ ] Testing never writes `repoos.toml`; ordinary agent edits auto-save after a
      short debounce with inline saving/saved/error feedback
- [ ] The manual Save button and unsaved-changes navigation prompt are removed
- [ ] The global bulk Test models button and all-at-once matrix summary are removed
- [ ] The server endpoint accepts a single combination and never expands it to other
      discovered/configured models
- [ ] Tests prove one click produces one fake-binary spawn and cover success/failure,
      loading state, result reset, and unsupported combinations
- [ ] `repoos check` passes, including browser smoke and screenshot freshness

## Notes for AI

- Reuse `testModelCombinations`/`promptCommand`; do not duplicate driver arguments.
- Prefer a singular request shape such as `POST /api/models/test` with
  `{ cli, model }`; a compatibility shim for the old matrix body is unnecessary
  because #0083 has only just landed.
- Relevant files: `src/server/server.ts`, `src/server/model-test.ts`,
  `src/ui-app/src/views/AgentsView.vue`, UI API types, and focused tests.
- Do not run a real provider test during automated verification; use fake binaries.
- Preserve CLI-specific live model discovery from #0083.

## Activity

- 2026-08-11T11:58:54Z · status review→done
