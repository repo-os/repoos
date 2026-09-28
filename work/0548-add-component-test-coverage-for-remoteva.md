---
id: "0548"
title: Add component test coverage for RemoteValidationDrawer.vue
type: bug
status: review
priority: p3
area: web
assigned_to: ai
created_by: ""
branch: feat/add-component-test-coverage-for-remoteva
model_override: opencode-go/glm-5.3-flash
review_model_override: opencode-go/mimo-v2.6-flash
created_at: "2026-09-27T13:14:24Z"
updated_at: "2026-09-28T12:50:49Z"
---
## Problem

`RemoteValidationDrawer.vue` (665 lines: Hetzner + Tailscale provider config,
per-host pool status, host-pool editor, test-connection flow) has zero
component test coverage. Confirmed via `grep -rl "RemoteValidationDrawer"
src/ui-app/tests/*.ts` — no matches.

This surfaced concretely during #0521: a template bug (the host-pool editor
was wrapped in the same `v-if` as the "Hosts" status list, so an empty pool
hid the only UI that could add the first host) shipped and only got caught
by manual review/reading, not a test. The fix (splitting the `v-if`, commit
442e3b0b) also has no regression test locking it in — a future edit could
silently re-merge those two conditions and nothing would catch it.

## Scope

Add `@vue/test-utils` `mount()`-based component tests for
`src/ui-app/src/components/RemoteValidationDrawer.vue`, following the
`mount()` pattern already used elsewhere (e.g.
`src/ui-app/tests/agents-view-cards.test.ts`, `board-keyboard-nav.test.ts`).
At minimum:

- The host-pool editor (the "Hosts (comma-separated)" input + "Save hosts"
  button) renders when `provider === "tailscale"` even when
  `status.hosts` is empty (the #0521 regression this task exists to prevent).
- The "Hosts" status list itself does NOT render when `status.hosts` is
  empty (the other half of that same `v-if` split — should stay gated).
- Provider switching (hetzner vs tailscale) shows/hides the right sections.

This will need mocking `api()` (`../api`) for `/api/remote-validation/status`
and setting up the Pinia stores (`useUiStore`, `useConfigStore`) the
component depends on — check how other drawer-style component tests in this
repo (if any comparable one exists) handle that setup, or establish the
pattern here since this is likely the first.

## Related, but explicitly NOT the same component — don't conflate

The Cloudflare tunnel publishing config (opened via `ui.openTunnel()`) looks
similar from the Settings page (a button that opens a config dialog), but it
is NOT a separate component file — it's inline inside the already-large
`src/ui-app/src/views/SettingsView.vue`. Testing it would mean testing
pieces of that much bigger view, a different and larger undertaking. Keep
this task scoped to `RemoteValidationDrawer.vue`; file the tunnel-config
coverage gap (if wanted) as its own separate task rather than growing this
one's scope mid-flight.

## Why this matters

AGENTS.md's Definition of Done expects tests for fixes; this class of
"big settings drawer" component apparently has no established test pattern
in this repo at all yet (grepped for an equivalent tunnel-drawer test too —
none exists, since it's not even a separate component). Establishing the
pattern on `RemoteValidationDrawer.vue` gives future edits to it (and a
template for genuinely-separate drawer components added later) actual
regression coverage instead of relying on manual review to catch template
logic errors like #0521's.

## Activity

- 2026-09-27T13:14:24Z · created · unknown
- 2026-09-28T12:05:45Z · model_override
- 2026-09-28T12:05:52Z · review_model_override
- 2026-09-28T12:05:53Z · status inbox→ready
- 2026-09-28T12:05:54Z · status ready→active, branch
- 2026-09-28T12:50:49Z · status active→review
