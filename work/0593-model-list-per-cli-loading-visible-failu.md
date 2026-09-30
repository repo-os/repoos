---
id: "0593"
title: "Model list: per-CLI loading, visible failures, caching"
type: bug
status: active
priority: p2
area: [web, core]
assigned_to: ai
created_by: ""
branch: feat/model-list-per-cli-loading-visible-failu
model_override: opencode-go/mimo-v2.6-flash
created_at: "2026-09-30T02:15:29Z"
updated_at: "2026-09-30T05:19:07Z"
---
## Problem
`GET /api/models` probes every coding-agent CLI in parallel and waits for the slowest (`listModelSources`, src/core/models.ts). The browser wraps every GET in a 15s abort (`API_TIMEOUT_MS`, src/ui-app/src/api.ts) — the same as the longest per-CLI server limit (Codex 15s, others 12s), so almost no margin. On abort, `loadModels` (src/ui-app/src/stores/config.ts) swallows the error, sets every list to empty and `modelsLoaded=false`, and the dropdowns silently fall back to `default` plus the static `agentsMeta.models` list. One slow CLI (or a slow network — Codex's `model/list` is account-aware) discards every CLI's list, and nothing tells the user. Adapters also return `[]` for a missing binary, timeout or auth problem, so even a successful response can't say *why* a list is empty.

Reported on a ThinkPad running `repoos serve` under Node 25: Codex models missing from the dropdown while `/api/models` itself returned them when called by hand. Runtime (Node vs Bun) and Codex version were checked and ruled out.

## Fix
1. **Per-CLI loading.** The UI requests each CLI's models separately, in parallel (the server's `listModelSources` already supports a `clis` filter — expose it on the route, e.g. `?cli=codex`), and fills each dropdown as its result lands. A slow or failing CLI affects only its own list.
2. **Visible states.** Per CLI: loading ("Loading models…"), loaded, failed ("Couldn't load models (timed out) — Retry"). Never silently show the static fallback as if it were the live list.
3. **Reasons from the server.** `ModelSourceResult` gains an optional `error`/`reason` (binary not found on PATH, timed out, not signed in, spawn failed) instead of a bare empty list; the dropdown shows it.
4. **Caching.** Server: short per-CLI TTL cache (~60s), bypassed by `?refresh=1`. Browser: persist the last good list per CLI (try/catch around storage), show it immediately on load, revalidate in the background, and on a failed refresh keep the old list with a "couldn't refresh" note.
5. **Backstop.** A longer client timeout (~30s) for model requests.

## Acceptance
- With one adapter made artificially slow or failing, the other CLIs' dropdowns still populate and the failing one shows a reason and a Retry.
- A reload shows cached models immediately, then updates.
- "Refresh models" bypasses both caches.
- Tests for the route filter, cache TTL/bypass, reason reporting, and the store's per-CLI states. Update the "Live model list" comments in AgentsView.vue and any docs describing `/api/models`.

## Activity

- 2026-09-30T02:15:29Z · created · unknown
- 2026-09-30T02:23:37Z · model_override
- 2026-09-30T02:23:52Z · status inbox→ready
- 2026-09-30T02:23:54Z · status ready→active, branch
- 2026-09-30T05:19:07Z · watchdog: auto-surfaced stuck task · status active→review · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-09-30T05:19:07Z · status review→active
